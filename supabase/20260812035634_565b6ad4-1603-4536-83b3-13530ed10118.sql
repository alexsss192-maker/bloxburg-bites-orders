-- ============ MEMBERS ============
CREATE TABLE public.members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username_key text NOT NULL UNIQUE,
  username text NOT NULL,
  avatar_url text,
  discord_id text,
  giveaway_entries integer NOT NULL DEFAULT 0,
  roles text[] NOT NULL DEFAULT '{}',
  delivered_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read members" ON public.members FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER members_set_updated_at BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.member_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  milestone integer NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  uses_remaining integer NOT NULL DEFAULT 0,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_rewards_member_idx ON public.member_rewards(member_id);
GRANT SELECT ON public.member_rewards TO authenticated;
GRANT ALL ON public.member_rewards TO service_role;
ALTER TABLE public.member_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read member rewards" ON public.member_rewards FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER member_rewards_set_updated_at BEFORE UPDATE ON public.member_rewards FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.member_discount_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  discount_id uuid NOT NULL REFERENCES public.chef_discounts(id) ON DELETE CASCADE,
  used_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, discount_id)
);
GRANT SELECT ON public.member_discount_claims TO authenticated;
GRANT ALL ON public.member_discount_claims TO service_role;
ALTER TABLE public.member_discount_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read claims" ON public.member_discount_claims FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TRIGGER member_discount_claims_set_updated_at BEFORE UPDATE ON public.member_discount_claims FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ PRIORITY ============
CREATE TABLE public.chef_priority_levels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('low','mid','high')),
  name text NOT NULL,
  price_bs integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#E8546B',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, tier)
);
GRANT SELECT ON public.chef_priority_levels TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chef_priority_levels TO authenticated;
GRANT ALL ON public.chef_priority_levels TO service_role;
ALTER TABLE public.chef_priority_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active priority levels" ON public.chef_priority_levels FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Chefs manage own priority levels" ON public.chef_priority_levels FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.is_staff(auth.uid()))
  WITH CHECK (owner_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "Admins oversee priority levels" ON public.chef_priority_levels FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins remove priority levels" ON public.chef_priority_levels FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER chef_priority_levels_set_updated_at BEFORE UPDATE ON public.chef_priority_levels FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  ADD COLUMN priority_tier text,
  ADD COLUMN priority_label text,
  ADD COLUMN priority_color text,
  ADD COLUMN priority_price_bs integer NOT NULL DEFAULT 0,
  ADD COLUMN discount_label text;

ALTER TABLE public.order_fulfillments
  ADD COLUMN priority_tier text,
  ADD COLUMN priority_label text,
  ADD COLUMN priority_color text,
  ADD COLUMN priority_price_bs integer NOT NULL DEFAULT 0;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.priority_rank(_tier text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _tier WHEN 'high' THEN 3 WHEN 'mid' THEN 2 WHEN 'low' THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_member(_username text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  key text := lower(trim(coalesce(_username,'')));
  mid uuid;
BEGIN
  IF length(key) < 2 THEN RAISE EXCEPTION 'Invalid username'; END IF;
  SELECT id INTO mid FROM public.members WHERE username_key = key;
  IF mid IS NULL THEN
    INSERT INTO public.members (username_key, username) VALUES (key, trim(_username))
    ON CONFLICT (username_key) DO UPDATE SET username = EXCLUDED.username
    RETURNING id INTO mid;
  END IF;
  RETURN mid;
END;
$$;

-- Grant the exact Panda Rewards progression for a member, idempotent per milestone.
CREATE OR REPLACE FUNCTION public.grant_panda_rewards(_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delivered integer;
  m integer;
  last_order uuid;
BEGIN
  SELECT count(*)::integer INTO delivered
  FROM public.orders o WHERE o.member_id = _member_id AND o.status = 'delivered';

  UPDATE public.members SET delivered_count = delivered, updated_at = now() WHERE id = _member_id;

  FOR m IN 1..least(delivered, 5) LOOP
    IF EXISTS (SELECT 1 FROM public.member_rewards WHERE member_id = _member_id AND milestone = m) THEN
      CONTINUE;
    END IF;
    SELECT o.id INTO last_order FROM public.orders o
      WHERE o.member_id = _member_id AND o.status = 'delivered'
      ORDER BY o.updated_at, o.created_at OFFSET (m - 1) LIMIT 1;

    IF m = 1 THEN
      INSERT INTO public.member_rewards (member_id, milestone, kind, label, value, uses_remaining, order_id)
      VALUES (_member_id, 1, 'discount', '20% off your next order', 20, 1, last_order);
    ELSIF m = 2 THEN
      INSERT INTO public.member_rewards (member_id, milestone, kind, label, value, uses_remaining, order_id) VALUES
        (_member_id, 2, 'priority', 'Auto Low Priority', 1, 0, last_order),
        (_member_id, 2, 'role', 'Fooder Role', 0, 0, last_order),
        (_member_id, 2, 'pickup', 'Pickup within 3 days', 72, 0, last_order);
      UPDATE public.members SET roles = (SELECT array_agg(DISTINCT r) FROM unnest(roles || ARRAY['Fooder']) r) WHERE id = _member_id;
    ELSIF m = 3 THEN
      INSERT INTO public.member_rewards (member_id, milestone, kind, label, value, uses_remaining, order_id) VALUES
        (_member_id, 3, 'discount', '30% off your next order', 30, 1, last_order),
        (_member_id, 3, 'giveaway', '2 giveaway entries', 2, 0, last_order);
      UPDATE public.members SET giveaway_entries = giveaway_entries + 2 WHERE id = _member_id;
    ELSIF m = 4 THEN
      INSERT INTO public.member_rewards (member_id, milestone, kind, label, value, uses_remaining, order_id) VALUES
        (_member_id, 4, 'discount', '20% off your next order', 20, 1, last_order),
        (_member_id, 4, 'pickup', 'Pickup within 7 days', 168, 0, last_order),
        (_member_id, 4, 'expired_claim', 'Claim 1 expired discount', 1, 1, last_order),
        (_member_id, 4, 'bs_payout', '10,000 B$', 10000, 1, last_order);
    ELSIF m = 5 THEN
      INSERT INTO public.member_rewards (member_id, milestone, kind, label, value, uses_remaining, order_id) VALUES
        (_member_id, 5, 'discount', '20% off your next 3 orders', 20, 3, last_order),
        (_member_id, 5, 'pickup', 'No pickup time limit', 0, 0, last_order),
        (_member_id, 5, 'priority', 'Auto Mid Priority', 2, 0, last_order),
        (_member_id, 5, 'expired_claim', 'Claim 2 expired discounts', 2, 2, last_order),
        (_member_id, 5, 'role', 'King of Fooders', 0, 0, last_order),
        (_member_id, 5, 'role', 'Custom Role', 0, 0, last_order);
      UPDATE public.members SET roles = (SELECT array_agg(DISTINCT r) FROM unnest(roles || ARRAY['King of Fooders','Custom Role']) r) WHERE id = _member_id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_orders_rewards()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM NEW.status) AND NEW.member_id IS NOT NULL THEN
    PERFORM public.grant_panda_rewards(NEW.member_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_grant_rewards AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_orders_rewards();

-- Best reward priority tier the member owns (from rewards).
CREATE OR REPLACE FUNCTION public.member_reward_priority(_member_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE max(value) WHEN 3 THEN 'high' WHEN 2 THEN 'mid' WHEN 1 THEN 'low' ELSE NULL END
  FROM public.member_rewards WHERE member_id = _member_id AND kind = 'priority';
$$;

-- ============ PUBLIC READS ============
CREATE OR REPLACE FUNCTION public.get_priority_levels()
RETURNS TABLE(owner_id uuid, chef_username text, is_admin boolean, tier text, name text, price_bs integer, color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.owner_id,
         COALESCE(NULLIF(sp.username,''), 'Chef'),
         public.has_role(p.owner_id,'admin'::app_role),
         p.tier, p.name, p.price_bs, p.color
  FROM public.chef_priority_levels p
  LEFT JOIN public.staff_profiles sp ON sp.user_id = p.owner_id
  WHERE p.is_active
  ORDER BY public.priority_rank(p.tier) ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_member_profile(_username text)
RETURNS TABLE(
  member_id uuid, username text, avatar_url text, delivered_count integer,
  giveaway_entries integer, roles text[], rewards jsonb,
  bs_owed integer, bs_paid integer, bs_spent_priority integer, bs_spent_orders integer,
  pickup_hours integer, priority_tier text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.username, m.avatar_url, m.delivered_count, m.giveaway_entries, m.roles,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'milestone', r.milestone, 'kind', r.kind, 'label', r.label,
        'value', r.value, 'uses_remaining', r.uses_remaining, 'seen_at', r.seen_at,
        'created_at', r.created_at
      ) ORDER BY r.milestone, r.id) FROM public.member_rewards r WHERE r.member_id = m.id), '[]'::jsonb),
    COALESCE((SELECT SUM(r.value) FROM public.member_rewards r WHERE r.member_id = m.id AND r.kind='bs_payout' AND r.uses_remaining > 0),0)::integer,
    COALESCE((SELECT SUM(r.value) FROM public.member_rewards r WHERE r.member_id = m.id AND r.kind='bs_payout' AND r.uses_remaining = 0),0)::integer,
    COALESCE((SELECT SUM(o.priority_price_bs) FROM public.orders o WHERE o.member_id = m.id AND o.status <> 'cancelled'),0)::integer,
    COALESCE((SELECT SUM(o.total_bs) FROM public.orders o WHERE o.member_id = m.id AND o.status = 'delivered'),0)::integer,
    COALESCE((SELECT CASE WHEN bool_or(r.value = 0) THEN 0 ELSE max(r.value) END
      FROM public.member_rewards r WHERE r.member_id = m.id AND r.kind='pickup'), 24)::integer,
    public.member_reward_priority(m.id)
  FROM public.members m
  WHERE m.username_key = lower(trim(_username));
$$;

CREATE OR REPLACE FUNCTION public.get_unseen_member_rewards(_username text)
RETURNS TABLE(milestone integer, rewards jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.milestone,
         jsonb_agg(jsonb_build_object('kind', r.kind, 'label', r.label, 'value', r.value) ORDER BY r.id)
  FROM public.member_rewards r
  JOIN public.members m ON m.id = r.member_id
  WHERE m.username_key = lower(trim(_username)) AND r.seen_at IS NULL
  GROUP BY r.milestone
  ORDER BY r.milestone;
$$;

CREATE OR REPLACE FUNCTION public.ack_member_rewards(_username text, _milestone integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.member_rewards r SET seen_at = now()
  WHERE r.seen_at IS NULL AND r.milestone = _milestone
    AND r.member_id = (SELECT id FROM public.members WHERE username_key = lower(trim(_username)));
$$;

-- Expired (not deleted) discounts a member with claim tokens may revive.
CREATE OR REPLACE FUNCTION public.list_claimable_expired_discounts(_username text)
RETURNS TABLE(id uuid, chef_username text, name text, code text, discount_type text, value integer, ended_at timestamptz, claimed boolean, claims_left integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT id FROM public.members WHERE username_key = lower(trim(_username))),
  tokens AS (
    SELECT COALESCE(SUM(uses_remaining),0)::integer AS tokens_left
    FROM public.member_rewards WHERE member_id = (SELECT id FROM me) AND kind = 'expired_claim'
  )
  SELECT cd.id, COALESCE(NULLIF(sp.username,''),'Chef'), cd.name, cd.code, cd.discount_type, cd.value, cd.ends_at,
         EXISTS (SELECT 1 FROM public.member_discount_claims c WHERE c.member_id = (SELECT id FROM me) AND c.discount_id = cd.id),
         (SELECT tokens_left FROM tokens)
  FROM public.chef_discounts cd
  LEFT JOIN public.staff_profiles sp ON sp.user_id = cd.owner_id
  WHERE (cd.ends_at IS NOT NULL AND cd.ends_at <= now()) OR cd.is_active = false
  ORDER BY cd.ends_at DESC NULLS LAST
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.claim_expired_discount(_username text, _discount_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mid uuid;
  token uuid;
  code text;
BEGIN
  SELECT id INTO mid FROM public.members WHERE username_key = lower(trim(_username));
  IF mid IS NULL THEN RAISE EXCEPTION 'No Panda member found for that username'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chef_discounts WHERE id = _discount_id) THEN
    RAISE EXCEPTION 'That discount no longer exists and can never be claimed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_discount_claims WHERE member_id = mid AND discount_id = _discount_id) THEN
    RAISE EXCEPTION 'You already claimed that discount';
  END IF;
  SELECT id INTO token FROM public.member_rewards
    WHERE member_id = mid AND kind = 'expired_claim' AND uses_remaining > 0 ORDER BY milestone LIMIT 1;
  IF token IS NULL THEN RAISE EXCEPTION 'You have no expired-discount claims available'; END IF;
  UPDATE public.member_rewards SET uses_remaining = uses_remaining - 1 WHERE id = token;
  INSERT INTO public.member_discount_claims (member_id, discount_id) VALUES (mid, _discount_id);
  SELECT COALESCE(cd.code, cd.name) INTO code FROM public.chef_discounts cd WHERE cd.id = _discount_id;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bs_payout_paid(_reward_id uuid, _paid boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.member_rewards
  SET uses_remaining = CASE WHEN _paid THEN 0 ELSE 1 END
  WHERE id = _reward_id AND kind = 'bs_payout';
END;
$$;

-- ============ ORDER PLACEMENT ============
DROP FUNCTION IF EXISTS public.preview_order_total(jsonb, text);
CREATE OR REPLACE FUNCTION public.preview_order_total(
  _items jsonb, _promo_code text DEFAULT NULL, _username text DEFAULT NULL, _priority jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(subtotal_bs integer, discount_bs integer, priority_bs integer, total_bs integer, discounts jsonb, applied_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT 1 FROM public.member_discount_claims c JOIN public.chef_discounts cd ON cd.id = c.discount_id
    WHERE c.member_id = mid AND c.used_order_id IS NULL AND upper(coalesce(cd.code,'')) = upper(trim(_promo_code))
  );

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
    SELECT ot.owner_id, ot.subtotal, picked.name, COALESCE(picked.savings,0)::integer AS savings
    FROM owner_totals ot
    LEFT JOIN LATERAL (
      SELECT cd.name,
        CASE WHEN cd.discount_type = 'percentage' THEN floor(ot.subtotal * cd.value / 100.0)::integer
             ELSE least(cd.value, ot.subtotal) END AS savings
      FROM public.chef_discounts cd
      WHERE cd.owner_id = ot.owner_id
        AND (
          (cd.is_active AND (cd.starts_at IS NULL OR cd.starts_at <= now()) AND (cd.ends_at IS NULL OR cd.ends_at > now())
            AND (cd.is_automatic OR (_promo_code IS NOT NULL AND upper(cd.code) = upper(trim(_promo_code)))))
          OR (claimed_ok AND _promo_code IS NOT NULL AND upper(coalesce(cd.code,'')) = upper(trim(_promo_code)))
        )
      ORDER BY savings DESC, cd.id LIMIT 1
    ) picked ON true
  )
  SELECT COALESCE(SUM(subtotal),0)::integer, COALESCE(SUM(savings),0)::integer,
         COALESCE(jsonb_agg(jsonb_build_object('name', name, 'savings_bs', savings)) FILTER (WHERE name IS NOT NULL), '[]'::jsonb)
  INTO sub, chef_disc, chef_json FROM best;

  IF mid IS NOT NULL THEN
    SELECT r.value, r.label INTO reward_pct, reward_label FROM public.member_rewards r
    WHERE r.member_id = mid AND r.kind = 'discount' AND r.uses_remaining > 0
    ORDER BY r.value DESC LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(p.price_bs),0)::integer INTO prio
  FROM jsonb_array_elements(coalesce(_priority,'[]'::jsonb)) x
  JOIN public.chef_priority_levels p
    ON p.owner_id = (x->>'owner_id')::uuid AND p.tier = (x->>'tier') AND p.is_active;

  IF COALESCE(reward_pct,0) > 0 AND floor(sub * reward_pct / 100.0)::integer > chef_disc THEN
    RETURN QUERY SELECT sub, floor(sub * reward_pct / 100.0)::integer, prio,
      sub - floor(sub * reward_pct / 100.0)::integer + prio,
      jsonb_build_array(jsonb_build_object('name', reward_label, 'savings_bs', floor(sub * reward_pct / 100.0)::integer)),
      reward_label;
  ELSE
    RETURN QUERY SELECT sub, chef_disc, prio, sub - chef_disc + prio, chef_json,
      CASE WHEN chef_disc > 0 THEN 'Chef discount' ELSE NULL END;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.place_order(text, text, jsonb, text, text);
CREATE OR REPLACE FUNCTION public.place_order(
  _discord_username text, _note text, _items jsonb,
  _verified_discord_id text DEFAULT NULL, _promo_code text DEFAULT NULL, _priority jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  discount_label text;
BEGIN
  IF _discord_username IS NULL OR length(trim(_discord_username)) < 2 OR length(trim(_discord_username)) > 64 THEN
    RAISE EXCEPTION 'Invalid Discord username';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN
    RAISE EXCEPTION 'Cart is empty or invalid';
  END IF;

  mid := public.ensure_member(_discord_username);

  IF _promo_code IS NOT NULL THEN
    SELECT c.discount_id INTO claimed_discount
    FROM public.member_discount_claims c JOIN public.chef_discounts cd ON cd.id = c.discount_id
    WHERE c.member_id = mid AND c.used_order_id IS NULL AND upper(coalesce(cd.code,'')) = upper(trim(_promo_code))
    LIMIT 1;
  END IF;

  INSERT INTO public.orders (discord_username, note, total_bs, subtotal_bs, discount_bs, verified_discord_id, member_id)
  VALUES (trim(_discord_username), NULLIF(trim(coalesce(_note,'')), ''), 0, 0, 0, _verified_discord_id, mid)
  RETURNING id INTO new_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    BEGIN
      m_id := (item->>'menu_item_id')::uuid;
      qty := (item->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid cart item';
    END;
    IF qty IS NULL OR qty <= 0 OR qty > 100 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    UPDATE public.menu_items SET stock = stock - qty, updated_at = now()
    WHERE id = m_id AND is_active = true AND price_bs > 0 AND stock >= qty
    RETURNING * INTO m;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item unavailable or insufficient stock'; END IF;

    line_subtotal := m.price_bs * qty;
    INSERT INTO public.order_items (order_id, menu_item_id, item_name, quantity, unit_price_bs, owner_id, subtotal_bs, discount_bs)
    VALUES (new_order_id, m.id, m.name, qty, m.price_bs, m.owner_id, line_subtotal, 0);
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
          CASE WHEN cd.discount_type = 'percentage' THEN floor(owner_subtotal * cd.value / 100.0)::integer
               ELSE least(cd.value, owner_subtotal) END AS savings
        FROM public.chef_discounts cd
        WHERE cd.owner_id = m.owner_id
          AND (
            (cd.is_active AND (cd.starts_at IS NULL OR cd.starts_at <= now()) AND (cd.ends_at IS NULL OR cd.ends_at > now())
              AND (cd.is_automatic OR (_promo_code IS NOT NULL AND upper(cd.code) = upper(trim(_promo_code)))))
            OR (claimed_discount IS NOT NULL AND cd.id = claimed_discount)
          )
      ) x
      ORDER BY x.savings DESC, x.id LIMIT 1;
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

  IF running_discount > 0 THEN discount_label := 'Chef discount'; END IF;

  -- Panda Reward discount applies to the whole order and never stacks; best one wins.
  SELECT r.id, r.value, r.label INTO reward_id, reward_pct, reward_label
  FROM public.member_rewards r
  WHERE r.member_id = mid AND r.kind = 'discount' AND r.uses_remaining > 0
  ORDER BY r.value DESC LIMIT 1;

  IF reward_id IS NOT NULL THEN
    reward_savings := floor(running_subtotal * reward_pct / 100.0)::integer;
    IF reward_savings > running_discount THEN
      UPDATE public.order_items SET discount_bs = 0, discount_id = NULL, discount_name = reward_label
        WHERE order_id = new_order_id;
      UPDATE public.order_fulfillments f
      SET discount_bs = floor(f.subtotal_bs * reward_pct / 100.0)::integer,
          total_bs = f.subtotal_bs - floor(f.subtotal_bs * reward_pct / 100.0)::integer
      WHERE f.order_id = new_order_id;
      SELECT COALESCE(SUM(discount_bs),0)::integer INTO running_discount
        FROM public.order_fulfillments WHERE order_id = new_order_id;
      UPDATE public.member_rewards SET uses_remaining = uses_remaining - 1 WHERE id = reward_id;
      discount_label := reward_label;
      claimed_discount := NULL;
    END IF;
  END IF;

  IF claimed_discount IS NOT NULL AND running_discount > 0 THEN
    UPDATE public.member_discount_claims SET used_order_id = new_order_id
      WHERE member_id = mid AND discount_id = claimed_discount AND used_order_id IS NULL;
  END IF;

  -- Priority: server-side prices only; reward priority applies automatically, highest wins.
  UPDATE public.order_fulfillments f
  SET priority_tier = sel.tier, priority_label = sel.name, priority_color = sel.color, priority_price_bs = sel.price_bs
  FROM (
    SELECT p.owner_id, p.tier, p.name, p.color, p.price_bs
    FROM jsonb_array_elements(coalesce(_priority,'[]'::jsonb)) x
    JOIN public.chef_priority_levels p
      ON p.owner_id = (x->>'owner_id')::uuid AND p.tier = (x->>'tier') AND p.is_active
  ) sel
  WHERE f.order_id = new_order_id AND f.chef_id = sel.owner_id;

  UPDATE public.order_fulfillments f
  SET priority_tier = p.tier, priority_label = p.name, priority_color = p.color
  FROM public.chef_priority_levels p
  WHERE f.order_id = new_order_id AND f.chef_id = p.owner_id AND p.is_active
    AND p.tier = public.member_reward_priority(mid)
    AND public.priority_rank(p.tier) > public.priority_rank(f.priority_tier);

  SELECT COALESCE(SUM(priority_price_bs),0)::integer INTO prio_total
    FROM public.order_fulfillments WHERE order_id = new_order_id;

  SELECT f.priority_tier, f.priority_label, f.priority_color INTO order_tier, order_label, order_color
  FROM public.order_fulfillments f WHERE f.order_id = new_order_id AND f.priority_tier IS NOT NULL
  ORDER BY public.priority_rank(f.priority_tier) DESC LIMIT 1;

  UPDATE public.orders
  SET subtotal_bs = running_subtotal,
      discount_bs = running_discount,
      priority_price_bs = prio_total,
      priority_tier = order_tier,
      priority_label = order_label,
      priority_color = order_color,
      discount_label = discount_label,
      total_bs = running_subtotal - running_discount + prio_total
  WHERE id = new_order_id;

  SELECT 'Order for @' || trim(_discord_username) || E'\n' ||
    string_agg('- ' || oi.item_name || ' x' || oi.quantity || '  B$' || (oi.unit_price_bs * oi.quantity), E'\n' ORDER BY oi.id)
    || E'\n' ||
    CASE WHEN running_discount > 0 THEN 'Discount: -B$' || running_discount || E'\n' ELSE '' END
    || CASE WHEN prio_total > 0 THEN 'Priority (' || coalesce(order_label,'') || '): B$' || prio_total || E'\n' ELSE '' END
    || 'Total: B$' || (running_subtotal - running_discount + prio_total) || E'\n\n' ||
    'This chat replaces Discord DMs. Please share your timezone and suggest a date and time for pickup so the chef can confirm.'
  INTO summary
  FROM public.order_items oi WHERE oi.order_id = new_order_id;

  INSERT INTO public.order_messages (order_id, sender_kind, author_name, body)
  VALUES (new_order_id, 'system', 'Panda Bites', summary);

  RETURN new_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(text, text, jsonb, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_order_total(jsonb, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_priority_levels() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_profile(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unseen_member_rewards(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_member_rewards(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_claimable_expired_discounts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_discount(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bs_payout_paid(uuid, boolean) TO authenticated;

-- Backfill members from existing orders so history and progress carry over.
INSERT INTO public.members (username_key, username)
SELECT DISTINCT lower(trim(o.discord_username)), trim(o.discord_username)
FROM public.orders o WHERE length(trim(o.discord_username)) >= 2
ON CONFLICT (username_key) DO NOTHING;

UPDATE public.orders o SET member_id = m.id
FROM public.members m WHERE m.username_key = lower(trim(o.discord_username)) AND o.member_id IS NULL;

UPDATE public.members m SET delivered_count = (
  SELECT count(*) FROM public.orders o WHERE o.member_id = m.id AND o.status = 'delivered'
);
