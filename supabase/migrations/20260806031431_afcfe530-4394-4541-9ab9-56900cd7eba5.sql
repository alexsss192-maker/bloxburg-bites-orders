CREATE TABLE public.order_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_kind text NOT NULL CHECK (sender_kind IN ('customer','chef','system')),
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX order_messages_order_id_created_at_idx ON public.order_messages(order_id, created_at);

GRANT SELECT, INSERT ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read messages on their orders"
ON public.order_messages FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.order_fulfillments f
    WHERE f.order_id = order_messages.order_id AND f.chef_id = auth.uid()
  )
);

CREATE POLICY "Staff post messages on their orders"
ON public.order_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_kind = 'chef'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.order_fulfillments f
      WHERE f.order_id = order_messages.order_id AND f.chef_id = auth.uid()
    )
  )
);

-- Customer-side access: scoped to a single order id, no table-wide reads.
CREATE OR REPLACE FUNCTION public.get_order_messages(_order_id uuid)
RETURNS TABLE(id uuid, sender_kind text, author_name text, body text, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.sender_kind, m.author_name, m.body, m.created_at
  FROM public.order_messages m
  WHERE m.order_id = _order_id
  ORDER BY m.created_at, m.id
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.post_order_message(_order_id uuid, _author_name text, _body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  recent integer;
BEGIN
  IF _body IS NULL OR length(trim(_body)) = 0 OR length(_body) > 1000 THEN
    RAISE EXCEPTION 'Message must be between 1 and 1000 characters';
  END IF;
  IF _author_name IS NULL OR length(trim(_author_name)) < 2 OR length(trim(_author_name)) > 64 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _order_id) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT count(*) INTO recent FROM public.order_messages m
  WHERE m.order_id = _order_id AND m.sender_kind = 'customer' AND m.created_at > now() - interval '1 minute';
  IF recent >= 20 THEN
    RAISE EXCEPTION 'Slow down a moment before sending more messages';
  END IF;

  INSERT INTO public.order_messages (order_id, sender_kind, author_name, body)
  VALUES (_order_id, 'customer', trim(_author_name), trim(_body))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_messages(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_order_message(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_messages(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_order_message(uuid, text, text) TO anon, authenticated, service_role;

-- Orders by typed username (no Discord verification anymore).
CREATE OR REPLACE FUNCTION public.get_orders_for_username(_username text)
RETURNS TABLE(id uuid, discord_username text, subtotal_bs integer, discount_bs integer, total_bs integer, status order_status, created_at timestamp with time zone, item_count integer, fulfillments jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.discord_username, o.subtotal_bs, o.discount_bs, o.total_bs, o.status, o.created_at,
    COALESCE((SELECT SUM(quantity)::integer FROM public.order_items oi WHERE oi.order_id = o.id), 0),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('status', f.status) ORDER BY f.id) FROM public.order_fulfillments f WHERE f.order_id = o.id), '[]'::jsonb)
  FROM public.orders o
  WHERE lower(o.discord_username) = lower(trim(_username))
  ORDER BY o.created_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.get_orders_for_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_for_username(text) TO anon, authenticated, service_role;

-- Seed the chat thread with a system message summarising the order.
CREATE OR REPLACE FUNCTION public.place_order(_discord_username text, _note text, _items jsonb, _verified_discord_id text DEFAULT NULL::text, _promo_code text DEFAULT NULL::text)
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

  SELECT 'Order for @' || trim(_discord_username) || E'\n' ||
    string_agg('- ' || oi.item_name || ' x' || oi.quantity || '  B$' || (oi.unit_price_bs * oi.quantity), E'\n' ORDER BY oi.id)
    || E'\n' ||
    CASE WHEN running_discount > 0 THEN 'Discount: -B$' || running_discount || E'\n' ELSE '' END
    || 'Total: B$' || (running_subtotal - running_discount) || E'\n\n' ||
    'This chat replaces Discord DMs. Please share your timezone and suggest a date and time for pickup so the chef can confirm.'
  INTO summary
  FROM public.order_items oi WHERE oi.order_id = new_order_id;

  INSERT INTO public.order_messages (order_id, sender_kind, author_name, body)
  VALUES (new_order_id, 'system', 'Panda Bites', summary);

  RETURN new_order_id;
END;
$function$;