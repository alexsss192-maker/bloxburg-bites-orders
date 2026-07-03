
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'chef');
CREATE TYPE public.food_category AS ENUM ('non_seasonal', 'seasonal');
CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'delivered', 'cancelled');

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','chef'));
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- menu_items
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_bs INTEGER NOT NULL CHECK (price_bs >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT,
  category public.food_category NOT NULL DEFAULT 'non_seasonal',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active non-seasonal items" ON public.menu_items FOR SELECT TO anon
  USING (is_active = true AND category = 'non_seasonal');
CREATE POLICY "Staff can view all items" ON public.menu_items FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage items" ON public.menu_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_username TEXT NOT NULL,
  note TEXT,
  total_bs INTEGER NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view orders" ON public.orders FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- order_items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_bs INTEGER NOT NULL CHECK (unit_price_bs >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view order items" ON public.order_items FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- place_order: transactional stock decrement + order creation, callable by anon
CREATE OR REPLACE FUNCTION public.place_order(
  _discord_username TEXT,
  _note TEXT,
  _items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order_id UUID;
  item JSONB;
  m_id UUID;
  qty INTEGER;
  m RECORD;
  running_total INTEGER := 0;
BEGIN
  IF _discord_username IS NULL OR length(trim(_discord_username)) < 2 THEN
    RAISE EXCEPTION 'Invalid Discord username';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  INSERT INTO public.orders (discord_username, note, total_bs)
  VALUES (trim(_discord_username), NULLIF(trim(coalesce(_note,'')), ''), 0)
  RETURNING id INTO new_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    m_id := (item->>'menu_item_id')::UUID;
    qty := (item->>'quantity')::INTEGER;
    IF qty IS NULL OR qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    UPDATE public.menu_items
      SET stock = stock - qty, updated_at = now()
      WHERE id = m_id
        AND is_active = true
        AND category = 'non_seasonal'
        AND stock >= qty
      RETURNING * INTO m;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item unavailable or insufficient stock';
    END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, item_name, quantity, unit_price_bs)
    VALUES (new_order_id, m.id, m.name, qty, m.price_bs);

    running_total := running_total + (m.price_bs * qty);
  END LOOP;

  UPDATE public.orders SET total_bs = running_total WHERE id = new_order_id;
  RETURN new_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(TEXT, TEXT, JSONB) TO anon, authenticated;

-- get_order_public: allow customer to view their own order by id (no auth required — id is a UUID)
CREATE OR REPLACE FUNCTION public.get_order_public(_order_id UUID)
RETURNS TABLE (
  id UUID,
  discord_username TEXT,
  note TEXT,
  total_bs INTEGER,
  status public.order_status,
  created_at TIMESTAMPTZ,
  items JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.discord_username, o.note, o.total_bs, o.status, o.created_at,
    COALESCE(jsonb_agg(jsonb_build_object(
      'item_name', oi.item_name,
      'quantity', oi.quantity,
      'unit_price_bs', oi.unit_price_bs
    )) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) as items
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.id = _order_id
  GROUP BY o.id;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_public(UUID) TO anon, authenticated;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER menu_items_set_updated_at BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
