CREATE TABLE public.verified_users (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar_url TEXT,
  first_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.verified_users TO service_role;
ALTER TABLE public.verified_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.discord_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dv_discord_id ON public.discord_verifications(discord_id, created_at DESC);
GRANT ALL ON public.discord_verifications TO service_role;
ALTER TABLE public.discord_verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ADD COLUMN verified_discord_id TEXT;
CREATE INDEX idx_orders_verified_discord_id ON public.orders(verified_discord_id, created_at DESC);

-- Update place_order to accept verified_discord_id
CREATE OR REPLACE FUNCTION public.place_order(_discord_username text, _note text, _items jsonb, _verified_discord_id text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.orders (discord_username, note, total_bs, verified_discord_id)
  VALUES (trim(_discord_username), NULLIF(trim(coalesce(_note,'')), ''), 0, _verified_discord_id)
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
$function$;

-- Get orders for a verified discord id (public: needs to work with anon since customers aren't Supabase-authed)
CREATE OR REPLACE FUNCTION public.get_orders_for_discord(_discord_id text)
 RETURNS TABLE(id uuid, discord_username text, total_bs integer, status order_status, created_at timestamptz, item_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.discord_username, o.total_bs, o.status, o.created_at,
    COALESCE((SELECT SUM(quantity)::integer FROM public.order_items oi WHERE oi.order_id = o.id), 0) as item_count
  FROM public.orders o
  WHERE o.verified_discord_id = _discord_id
  ORDER BY o.created_at DESC
  LIMIT 100;
$function$;
