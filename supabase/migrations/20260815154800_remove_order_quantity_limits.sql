-- Remove artificial order quantity limits for bulk / Fast Service
-- qty was capped at 100; cart lines at 50

CREATE OR REPLACE FUNCTION public.preview_order_total(
  _items jsonb,
  _promo_code text DEFAULT NULL,
  _username text DEFAULT NULL,
  _priority jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(
  subtotal_bs integer,
  discount_bs integer,
  priority_bs integer,
  total_bs integer,
  discounts jsonb,
  applied_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid uuid;
  sub integer := 0;
  chef_disc integer := 0;
  reward_pct integer := 0;
  reward_label text;
  prio integer := 0;
  chef_json jsonb := '[]'::jsonb;
  claimed_ok boolean := false;
BEGIN
  SELECT id INTO mid FROM public.members WHERE username_key = lower(trim(coalesce(_username,'')));

  claimed_ok := mid IS NOT NULL AND _promo_code IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.member_discount_claims c
    JOIN public.chef_discounts cd ON cd.id = c.discount_id
    WHERE c.member_id = mid
      AND c.used_order_id IS NULL
      AND upper(coalesce(cd.code,'')) = upper(trim(_promo_code))
  );

  WITH requested AS (
    SELECT
      (x->>'menu_item_id')::uuid AS item_id,
      (x->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(_items) x
    WHERE (x->>'quantity')::integer > 0
  ),
  owner_totals AS (
    SELECT
      mi.owner_id,
      SUM(mi.price_bs * r.quantity)::integer AS subtotal
    FROM requested r
    JOIN public.menu_items mi ON mi.id = r.item_id
    WHERE mi.is_active AND mi.stock >= r.quantity AND mi.price_bs > 0
    GROUP BY mi.owner_id
  ),
  best AS (
    SELECT
      ot.owner_id,
      ot.subtotal,
      picked.name,
      COALESCE(picked.savings, 0)::integer AS savings
    FROM owner_totals ot
    LEFT JOIN LATERAL (
      SELECT
        cd.name,
        CASE
          WHEN cd.discount_type = 'percentage'
            THEN floor(ot.subtotal * cd.value / 100.0)::integer
          ELSE least(cd.value, ot.subtotal)
        END AS savings
      FROM public.chef_discounts cd
      WHERE cd.owner_id = ot.owner_id
        AND (
          (
            cd.is_active
            AND (cd.starts_at IS NULL OR cd.starts_at <= now())
            AND (cd.ends_at IS NULL OR cd.ends_at > now())
            AND (
              cd.is_automatic
              OR (_promo_code IS NOT NULL AND upper(cd.code) = upper(trim(_promo_code)))
            )
          )
          OR (
            claimed_ok
            AND _promo_code IS NOT NULL
            AND upper(coalesce(cd.code,'')) = upper(trim(_promo_code))
          )
        )
      ORDER BY savings DESC, cd.id
      LIMIT 1
    ) picked ON true
  )
  SELECT
    COALESCE(SUM(subtotal), 0)::integer,
    COALESCE(SUM(savings), 0)::integer,
    COALESCE(
      jsonb_agg(jsonb_build_object('name', name, 'savings_bs', savings))
        FILTER (WHERE name IS NOT NULL),
      '[]'::jsonb
    )
  INTO sub, chef_disc, chef_json
  FROM best;

  IF mid IS NOT NULL THEN
    SELECT r.value, r.label
    INTO reward_pct, reward_label
    FROM public.member_rewards r
    WHERE r.member_id = mid AND r.kind = 'discount' AND r.uses_remaining > 0
    ORDER BY r.value DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(p.price_bs), 0)::integer INTO prio
  FROM jsonb_array_elements(coalesce(_priority, '[]'::jsonb)) x
  JOIN public.chef_priority_levels p
    ON p.owner_id = (x->>'owner_id')::uuid
   AND p.tier = (x->>'tier')
   AND p.is_active;

  IF COALESCE(reward_pct, 0) > 0
     AND floor(sub * reward_pct / 100.0)::integer > chef_disc THEN
    RETURN QUERY SELECT
      sub,
      floor(sub * reward_pct / 100.0)::integer,
      prio,
      sub - floor(sub * reward_pct / 100.0)::integer + prio,
      jsonb_build_array(
        jsonb_build_object(
          'name', reward_label,
          'savings_bs', floor(sub * reward_pct / 100.0)::integer
        )
      ),
      reward_label;
  ELSE
    RETURN QUERY SELECT
      sub,
      chef_disc,
      prio,
      sub - chef_disc + prio,
      chef_json,
      CASE WHEN chef_disc > 0 THEN 'Chef discount' ELSE NULL END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_order(
  _discord_username text,
  _note text,
  _items jsonb,
  _verified_discord_id text DEFAULT NULL::text,
  _promo_code text DEFAULT NULL::text,
  _priority jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_order_id uuid;
  item jsonb;
  m_id uuid;
  qty integer;
  m record;
  d record;
  line_subtotal integer;
  owner_subtotal integer;
  owner_discount integer;
  running_subtotal integer := 0;
  running_discount integer := 0;
  selected_discount_id uuid;
  selected_discount_name text;
  summary text;
  mid uuid;
  claimed_discount uuid;
  reward_id uuid;
  reward_pct integer := 0;
  reward_label text;
  reward_savings integer := 0;
  prio_total integer := 0;
  order_tier text;
  order_label text;
  order_color text;
  v_discount_label text;
BEGIN
  IF _discord_username IS NULL
     OR length(trim(_discord_username)) < 2
     OR length(trim(_discord_username)) > 64 THEN
    RAISE EXCEPTION 'Invalid Discord username';
  END IF;

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 500 THEN
    RAISE EXCEPTION 'Cart is empty or invalid';
  END IF;

  mid := public.ensure_member(_discord_username);

  IF _promo_code IS NOT NULL THEN
    SELECT c.discount_id INTO claimed_discount
    FROM public.member_discount_claims c
    JOIN public.chef_discounts cd ON cd.id = c.discount_id
    WHERE c.member_id = mid
      AND c.used_order_id IS NULL
      AND upper(coalesce(cd.code, '')) = upper(trim(_promo_code))
    LIMIT 1;
  END IF;

  INSERT INTO public.orders (
    discord_username, note, total_bs, subtotal_bs, discount_bs,
    verified_discord_id, member_id
  )
  VALUES (
    trim(_discord_username),
    NULLIF(trim(coalesce(_note, '')), ''),
    0, 0, 0,
    _verified_discord_id,
    mid
  )
  RETURNING id INTO new_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      m_id := (item->>'menu_item_id')::uuid;
      qty := (item->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid cart item';
    END;

    -- No upper quantity limit (was qty > 100)
    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    UPDATE public.menu_items
    SET stock = stock - qty, updated_at = now()
    WHERE id = m_id
      AND is_active = true
      AND price_bs > 0
      AND stock >= qty
    RETURNING * INTO m;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item unavailable or insufficient stock';
    END IF;

    line_subtotal := m.price_bs * qty;

    INSERT INTO public.order_items (
      order_id, menu_item_id, item_name, quantity,
      unit_price_bs, owner_id, subtotal_bs, discount_bs
    )
    VALUES (
      new_order_id, m.id, m.name, qty,
      m.price_bs, m.owner_id, line_subtotal, 0
    );

    running_subtotal := running_subtotal + line_subtotal;
  END LOOP;

  FOR m IN
    SELECT owner_id, SUM(subtotal_bs)::integer AS subtotal
    FROM public.order_items
    WHERE order_id = new_order_id
    GROUP BY owner_id
  LOOP
    owner_subtotal := m.subtotal;
    owner_discount := 0;
    selected_discount_id := NULL;
    selected_discount_name := NULL;

    IF m.owner_id IS NOT NULL THEN
      SELECT x.id, x.name, x.savings INTO d
      FROM (
        SELECT
          cd.id,
          cd.name,
          CASE
            WHEN cd.discount_type = 'percentage'
              THEN floor(owner_subtotal * cd.value / 100.0)::integer
            ELSE least(cd.value, owner_subtotal)
          END AS savings
        FROM public.chef_discounts cd
        WHERE cd.owner_id = m.owner_id
          AND (
            (
              cd.is_active
              AND (cd.starts_at IS NULL OR cd.starts_at <= now())
              AND (cd.ends_at IS NULL OR cd.ends_at > now())
              AND (
                cd.is_automatic
                OR (
                  _promo_code IS NOT NULL
                  AND upper(cd.code) = upper(trim(_promo_code))
                )
              )
            )
            OR (claimed_discount IS NOT NULL AND cd.id = claimed_discount)
          )
      ) x
      ORDER BY x.savings DESC, x.id
      LIMIT 1;

      IF FOUND THEN
        owner_discount := greatest(0, least(d.savings, owner_subtotal));
        selected_discount_id := d.id;
        selected_discount_name := d.name;

        UPDATE public.order_items
        SET
          discount_bs = CASE
            WHEN id = (
              SELECT id
              FROM public.order_items
              WHERE order_id = new_order_id AND owner_id = m.owner_id
              ORDER BY id
              LIMIT 1
            ) THEN owner_discount
            ELSE 0
          END,
          discount_id = selected_discount_id,
          discount_name = selected_discount_name
        WHERE order_id = new_order_id AND owner_id = m.owner_id;
      END IF;
    END IF;

    INSERT INTO public.order_fulfillments (
      order_id, chef_id, subtotal_bs, discount_bs, total_bs
    )
    VALUES (
      new_order_id,
      m.owner_id,
      owner_subtotal,
      owner_discount,
      owner_subtotal - owner_discount
    );

    running_discount := running_discount + owner_discount;
  END LOOP;

  IF running_discount > 0 THEN
    v_discount_label := 'Chef discount';
  END IF;

  SELECT r.id, r.value, r.label
  INTO reward_id, reward_pct, reward_label
  FROM public.member_rewards r
  WHERE r.member_id = mid AND r.kind = 'discount' AND r.uses_remaining > 0
  ORDER BY r.value DESC
  LIMIT 1;

  IF reward_id IS NOT NULL THEN
    reward_savings := floor(running_subtotal * reward_pct / 100.0)::integer;
    IF reward_savings > running_discount THEN
      UPDATE public.order_items
      SET discount_bs = 0, discount_id = NULL, discount_name = reward_label
      WHERE order_id = new_order_id;

      UPDATE public.order_fulfillments f
      SET
        discount_bs = floor(f.subtotal_bs * reward_pct / 100.0)::integer,
        total_bs = f.subtotal_bs - floor(f.subtotal_bs * reward_pct / 100.0)::integer
      WHERE f.order_id = new_order_id;

      SELECT COALESCE(SUM(discount_bs), 0)::integer
      INTO running_discount
      FROM public.order_fulfillments
      WHERE order_id = new_order_id;

      UPDATE public.member_rewards
      SET uses_remaining = uses_remaining - 1
      WHERE id = reward_id;

      v_discount_label := reward_label;
      claimed_discount := NULL;
    END IF;
  END IF;

  IF claimed_discount IS NOT NULL AND running_discount > 0 THEN
    UPDATE public.member_discount_claims
    SET used_order_id = new_order_id
    WHERE member_id = mid
      AND discount_id = claimed_discount
      AND used_order_id IS NULL;
  END IF;

  UPDATE public.order_fulfillments f
  SET
    priority_tier = sel.tier,
    priority_label = sel.name,
    priority_color = sel.color,
    priority_price_bs = sel.price_bs
  FROM (
    SELECT p.owner_id, p.tier, p.name, p.color, p.price_bs
    FROM jsonb_array_elements(coalesce(_priority, '[]'::jsonb)) x
    JOIN public.chef_priority_levels p
      ON p.owner_id = (x->>'owner_id')::uuid
     AND p.tier = (x->>'tier')
     AND p.is_active
  ) sel
  WHERE f.order_id = new_order_id AND f.chef_id = sel.owner_id;

  UPDATE public.order_fulfillments f
  SET
    priority_tier = p.tier,
    priority_label = p.name,
    priority_color = p.color
  FROM public.chef_priority_levels p
  WHERE f.order_id = new_order_id
    AND f.chef_id = p.owner_id
    AND p.is_active
    AND p.tier = public.member_reward_priority(mid)
    AND public.priority_rank(p.tier) > public.priority_rank(f.priority_tier);

  SELECT COALESCE(SUM(priority_price_bs), 0)::integer
  INTO prio_total
  FROM public.order_fulfillments
  WHERE order_id = new_order_id;

  SELECT f.priority_tier, f.priority_label, f.priority_color
  INTO order_tier, order_label, order_color
  FROM public.order_fulfillments f
  WHERE f.order_id = new_order_id AND f.priority_tier IS NOT NULL
  ORDER BY public.priority_rank(f.priority_tier) DESC
  LIMIT 1;

  UPDATE public.orders
  SET
    subtotal_bs = running_subtotal,
    discount_bs = running_discount,
    priority_price_bs = prio_total,
    priority_tier = order_tier,
    priority_label = order_label,
    priority_color = order_color,
    discount_label = v_discount_label,
    total_bs = running_subtotal - running_discount + prio_total
  WHERE id = new_order_id;

  SELECT
    'Order for @' || trim(_discord_username) || E'\n' ||
    string_agg(
      '- ' || oi.item_name || ' x' || oi.quantity ||
      '  B$' || (oi.unit_price_bs * oi.quantity),
      E'\n' ORDER BY oi.id
    ) || E'\n' ||
    CASE
      WHEN running_discount > 0 THEN 'Discount: -B$' || running_discount || E'\n'
      ELSE ''
    END ||
    CASE
      WHEN prio_total > 0
        THEN 'Priority (' || coalesce(order_label, '') || '): B$' || prio_total || E'\n'
      ELSE ''
    END ||
    'Total: B$' || (running_subtotal - running_discount + prio_total) || E'\n\n' ||
    'This chat replaces Discord DMs. Please share your timezone and suggest a date and time for pickup so the chef can confirm.'
  INTO summary
  FROM public.order_items oi
  WHERE oi.order_id = new_order_id;

  INSERT INTO public.order_messages (order_id, sender_kind, author_name, body)
  VALUES (new_order_id, 'system', 'Panda Bites', summary);

  RETURN new_order_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.place_order(text, text, jsonb, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_order_total(jsonb, text, text, jsonb) TO anon, authenticated;
