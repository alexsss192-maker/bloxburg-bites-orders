BEGIN;

-- Update the public SELECT policy to allow both seasonal and non-seasonal items
DROP POLICY IF EXISTS "Public can view active non-seasonal items" ON public.menu_items;
CREATE POLICY "Public can view active items"
  ON public.menu_items
  FOR SELECT
  TO anon
  USING (is_active = true);

-- Update place_order to allow ordering any active in-stock menu item
CREATE OR REPLACE FUNCTION public.place_order(
  _discord_username text,
  _note text,
  _items jsonb,
  _verified_discord_id text DEFAULT NULL::text,
  _promo_code text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
BEGIN
  IF _discord_username IS NULL OR length(trim(_discord_username)) < 2 OR length(trim(_discord_username)) > 64 THEN
    RAISE EXCEPTION 'Invalid Discord username';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN
    RAISE EXCEPTION 'Cart is empty or invalid';
  END IF;

  INSERT INTO public.orders (discord_username, note, total_bs, subtotal_bs, discount_bs, verified_discord_id)
  VALUES (trim(_discord_username), NULLIF(trim(coalesce(_note,'')), ''), 0, 0, 0, _verified_discord_id)
  RETURNING id INTO new_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      m_id := (item->>'menu_item_id')::uuid;
      qty := (item->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid cart item';
    END;
    IF qty IS NULL OR qty <= 0 OR qty > 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    UPDATE public.menu_items
    SET stock = stock - qty, updated_at = now()
    WHERE id = m_id AND is_active = true AND price_bs > 0 AND stock >= qty
    RETURNING * INTO m;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item unavailable or insufficient stock'; END IF;

    line_subtotal := m.price_bs * qty;
    INSERT INTO public.order_items (
      order_id, menu_item_id, item_name, quantity, unit_price_bs, owner_id, subtotal_bs, discount_bs
    ) VALUES (
      new_order_id, m.id, m.name, qty, m.price_bs, m.owner_id, line_subtotal, 0
    );
    running_subtotal := running_subtotal + line_subtotal;
  END LOOP;

  FOR m IN
    SELECT owner_id, SUM(subtotal_bs)::integer AS subtotal
    FROM public.order_items WHERE order_id = new_order_id GROUP BY owner_id
  LOOP
    owner_subtotal := m.subtotal;
    owner_discount := 0;
    selected_discount_id := NULL;
    selected_discount_name := NULL;

    IF m.owner_id IS NOT NULL THEN
      SELECT x.id, x.name, x.savings INTO d
      FROM (
        SELECT cd.id, cd.name,
          CASE WHEN cd.discount_type = 'percentage'
            THEN floor(owner_subtotal * cd.value / 100.0)::integer
            ELSE least(cd.value, owner_subtotal)
          END AS savings
        FROM public.chef_discounts cd
        WHERE cd.owner_id = m.owner_id
          AND cd.is_active
          AND (cd.starts_at IS NULL OR cd.starts_at <= now())
          AND (cd.ends_at IS NULL OR cd.ends_at > now())
          AND (cd.is_automatic OR (_promo_code IS NOT NULL AND upper(cd.code) = upper(trim(_promo_code))))
      ) x
      ORDER BY x.savings DESC, x.id
      LIMIT 1;
      IF FOUND THEN
        owner_discount := greatest(0, least(d.savings, owner_subtotal));
        selected_discount_id := d.id;
        selected_discount_name := d.name;
        UPDATE public.order_items
        SET discount_bs = CASE WHEN id = (
              SELECT id FROM public.order_items WHERE order_id = new_order_id AND owner_id = m.owner_id ORDER BY id LIMIT 1
            ) THEN owner_discount ELSE 0 END,
            discount_id = selected_discount_id,
            discount_name = selected_discount_name
        WHERE order_id = new_order_id AND owner_id = m.owner_id;
      END IF;
    END IF;

    INSERT INTO public.order_fulfillments (order_id, chef_id, subtotal_bs, discount_bs, total_bs)
    VALUES (new_order_id, m.owner_id, owner_subtotal, owner_discount, owner_subtotal - owner_discount);
    running_discount := running_discount + owner_discount;
  END LOOP;

  UPDATE public.orders
  SET subtotal_bs = running_subtotal,
      discount_bs = running_discount,
      total_bs = running_subtotal - running_discount
  WHERE id = new_order_id;
  RETURN new_order_id;
END;
$function$;

-- Update preview_order_total to allow any active item
CREATE OR REPLACE FUNCTION public.preview_order_total(
  _items jsonb,
  _promo_code text DEFAULT NULL::text
)
RETURNS TABLE(subtotal_bs integer, discount_bs integer, total_bs integer, discounts jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH requested AS (
    SELECT (x->>'menu_item_id')::uuid AS item_id, (x->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(_items) x
    WHERE (x->>'quantity')::integer > 0 AND (x->>'quantity')::integer <= 100
  ), owner_totals AS (
    SELECT mi.owner_id, SUM(mi.price_bs * r.quantity)::integer AS subtotal
    FROM requested r JOIN public.menu_items mi ON mi.id = r.item_id
    WHERE mi.is_active AND mi.stock >= r.quantity AND mi.price_bs > 0
    GROUP BY mi.owner_id
  ), best AS (
    SELECT ot.owner_id, ot.subtotal, picked.name, COALESCE(picked.savings, 0)::integer AS savings
    FROM owner_totals ot
    LEFT JOIN LATERAL (
      SELECT cd.name,
        CASE WHEN cd.discount_type = 'percentage'
          THEN floor(ot.subtotal * cd.value / 100.0)::integer
          ELSE least(cd.value, ot.subtotal)
        END AS savings
      FROM public.chef_discounts cd
      WHERE cd.owner_id = ot.owner_id AND cd.is_active
        AND (cd.starts_at IS NULL OR cd.starts_at <= now())
        AND (cd.ends_at IS NULL OR cd.ends_at > now())
        AND (cd.is_automatic OR (_promo_code IS NOT NULL AND upper(cd.code) = upper(trim(_promo_code))))
      ORDER BY savings DESC, cd.id LIMIT 1
    ) picked ON true
  )
  SELECT COALESCE(SUM(best.subtotal),0)::integer,
         COALESCE(SUM(best.savings),0)::integer,
         COALESCE(SUM(best.subtotal - best.savings),0)::integer,
         COALESCE(jsonb_agg(jsonb_build_object('name', best.name, 'savings_bs', best.savings)) FILTER (WHERE best.name IS NOT NULL), '[]'::jsonb)
  FROM best;
END;
$function$;

COMMIT;