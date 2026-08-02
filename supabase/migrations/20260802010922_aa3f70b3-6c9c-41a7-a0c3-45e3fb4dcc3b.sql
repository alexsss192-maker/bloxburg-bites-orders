CREATE TABLE public.chef_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  code text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  value integer NOT NULL,
  is_automatic boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chef_discounts_value_check CHECK (
    value > 0 AND ((discount_type = 'percentage' AND value <= 100) OR
    (discount_type = 'fixed' AND value <= 100000000))
  ),
  CONSTRAINT chef_discounts_code_mode_check CHECK (
    (is_automatic AND code IS NULL) OR
    ((NOT is_automatic) AND code IS NOT NULL AND char_length(trim(code)) BETWEEN 2 AND 32)
  ),
  CONSTRAINT chef_discounts_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chef_discounts TO authenticated;
GRANT ALL ON public.chef_discounts TO service_role;
ALTER TABLE public.chef_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chefs manage own discounts" ON public.chef_discounts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.is_staff(auth.uid()))
  WITH CHECK (owner_id = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "Admins oversee discounts" ON public.chef_discounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX chef_discounts_owner_code_unique
  ON public.chef_discounts (owner_id, upper(code)) WHERE code IS NOT NULL;
CREATE INDEX chef_discounts_active_owner_idx ON public.chef_discounts (owner_id, is_active);
CREATE TRIGGER chef_discounts_set_updated_at BEFORE UPDATE ON public.chef_discounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN subtotal_bs integer NOT NULL DEFAULT 0 CHECK (subtotal_bs >= 0),
  ADD COLUMN discount_bs integer NOT NULL DEFAULT 0 CHECK (discount_bs >= 0);
UPDATE public.orders SET subtotal_bs = total_bs WHERE subtotal_bs = 0;

ALTER TABLE public.order_items
  ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN subtotal_bs integer NOT NULL DEFAULT 0 CHECK (subtotal_bs >= 0),
  ADD COLUMN discount_bs integer NOT NULL DEFAULT 0 CHECK (discount_bs >= 0),
  ADD COLUMN discount_id uuid REFERENCES public.chef_discounts(id) ON DELETE SET NULL,
  ADD COLUMN discount_name text;
UPDATE public.order_items oi
SET owner_id = mi.owner_id,
    subtotal_bs = oi.unit_price_bs * oi.quantity
FROM public.menu_items mi
WHERE mi.id = oi.menu_item_id;

CREATE TABLE public.order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  chef_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  subtotal_bs integer NOT NULL DEFAULT 0 CHECK (subtotal_bs >= 0),
  discount_bs integer NOT NULL DEFAULT 0 CHECK (discount_bs >= 0),
  total_bs integer NOT NULL DEFAULT 0 CHECK (total_bs >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, chef_id)
);
GRANT SELECT, UPDATE ON public.order_fulfillments TO authenticated;
GRANT ALL ON public.order_fulfillments TO service_role;
ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chefs view own fulfillment" ON public.order_fulfillments
  FOR SELECT TO authenticated
  USING (chef_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Chefs update own fulfillment" ON public.order_fulfillments
  FOR UPDATE TO authenticated
  USING (chef_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (chef_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX order_fulfillments_chef_idx ON public.order_fulfillments (chef_id, created_at DESC);
CREATE INDEX order_fulfillments_order_idx ON public.order_fulfillments (order_id);
CREATE TRIGGER order_fulfillments_set_updated_at BEFORE UPDATE ON public.order_fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.order_fulfillments (order_id, chef_id, status, subtotal_bs, discount_bs, total_bs)
SELECT o.id, oi.owner_id, o.status, SUM(oi.subtotal_bs)::integer, 0, SUM(oi.subtotal_bs)::integer
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
GROUP BY o.id, oi.owner_id, o.status
ON CONFLICT (order_id, chef_id) DO NOTHING;

DROP POLICY IF EXISTS "Staff view orders" ON public.orders;
DROP POLICY IF EXISTS "Staff update orders" ON public.orders;
CREATE POLICY "Staff view assigned orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.order_fulfillments f
      WHERE f.order_id = orders.id AND f.chef_id = auth.uid()
    )
  );
CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff view order items" ON public.order_items;
CREATE POLICY "Staff view assigned order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_validate_fulfillment_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_rank integer;
  new_rank integer;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF OLD.status = 'cancelled' OR OLD.status = 'delivered' THEN
    RAISE EXCEPTION 'A completed or cancelled fulfillment cannot be reopened';
  END IF;
  old_rank := CASE OLD.status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ready' THEN 2 WHEN 'delivered' THEN 3 ELSE 99 END;
  new_rank := CASE NEW.status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ready' THEN 2 WHEN 'delivered' THEN 3 ELSE 99 END;
  IF new_rank <> old_rank + 1 THEN
    RAISE EXCEPTION 'Fulfillment status must advance one step at a time';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_fulfillment_transition BEFORE UPDATE OF status ON public.order_fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_fulfillment_transition();

CREATE OR REPLACE FUNCTION public.tg_sync_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status public.order_status;
BEGIN
  SELECT CASE
    WHEN bool_and(status = 'cancelled') THEN 'cancelled'::public.order_status
    WHEN bool_and(status = 'delivered') THEN 'delivered'::public.order_status
    WHEN bool_and(status IN ('ready','delivered')) THEN 'ready'::public.order_status
    WHEN bool_or(status IN ('preparing','ready','delivered')) THEN 'preparing'::public.order_status
    ELSE 'pending'::public.order_status
  END INTO next_status
  FROM public.order_fulfillments
  WHERE order_id = NEW.order_id;
  UPDATE public.orders SET status = next_status, updated_at = now() WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_order_status AFTER INSERT OR UPDATE OF status ON public.order_fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_order_status();

DROP FUNCTION IF EXISTS public.place_order(text, text, jsonb);
DROP FUNCTION IF EXISTS public.place_order(text, text, jsonb, text);
CREATE FUNCTION public.place_order(
  _discord_username text,
  _note text,
  _items jsonb,
  _verified_discord_id text DEFAULT NULL,
  _promo_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE id = m_id AND is_active = true AND category = 'non_seasonal' AND price_bs > 0 AND stock >= qty
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
$$;
REVOKE ALL ON FUNCTION public.place_order(text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,jsonb,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_order_total(_items jsonb, _promo_code text DEFAULT NULL)
RETURNS TABLE(subtotal_bs integer, discount_bs integer, total_bs integer, discounts jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH requested AS (
    SELECT (x->>'menu_item_id')::uuid AS item_id, (x->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(_items) x
    WHERE (x->>'quantity')::integer > 0 AND (x->>'quantity')::integer <= 100
  ), owner_totals AS (
    SELECT mi.owner_id, SUM(mi.price_bs * r.quantity)::integer AS subtotal
    FROM requested r JOIN public.menu_items mi ON mi.id = r.item_id
    WHERE mi.is_active AND mi.category = 'non_seasonal' AND mi.stock >= r.quantity AND mi.price_bs > 0
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
$$;
REVOKE ALL ON FUNCTION public.preview_order_total(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_order_total(jsonb,text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_order_public(uuid);
CREATE FUNCTION public.get_order_public(_order_id uuid)
RETURNS TABLE(id uuid, discord_username text, note text, subtotal_bs integer, discount_bs integer, total_bs integer, status public.order_status, created_at timestamptz, items jsonb, fulfillments jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.discord_username, o.note, o.subtotal_bs, o.discount_bs, o.total_bs, o.status, o.created_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'item_name', oi.item_name, 'quantity', oi.quantity, 'unit_price_bs', oi.unit_price_bs,
      'subtotal_bs', oi.subtotal_bs, 'discount_bs', oi.discount_bs, 'discount_name', oi.discount_name
    ) ORDER BY oi.id) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('status', f.status, 'subtotal_bs', f.subtotal_bs, 'discount_bs', f.discount_bs, 'total_bs', f.total_bs) ORDER BY f.id)
      FROM public.order_fulfillments f WHERE f.order_id = o.id), '[]'::jsonb)
  FROM public.orders o WHERE o.id = _order_id;
$$;
REVOKE ALL ON FUNCTION public.get_order_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_public(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_orders_for_discord(text);
CREATE FUNCTION public.get_orders_for_discord(_discord_id text)
RETURNS TABLE(id uuid, discord_username text, subtotal_bs integer, discount_bs integer, total_bs integer, status public.order_status, created_at timestamptz, item_count integer, fulfillments jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.discord_username, o.subtotal_bs, o.discount_bs, o.total_bs, o.status, o.created_at,
    COALESCE((SELECT SUM(quantity)::integer FROM public.order_items oi WHERE oi.order_id = o.id), 0),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('status', f.status) ORDER BY f.id) FROM public.order_fulfillments f WHERE f.order_id = o.id), '[]'::jsonb)
  FROM public.orders o
  WHERE o.verified_discord_id = _discord_id
  ORDER BY o.created_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_orders_for_discord(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_for_discord(text) TO service_role;