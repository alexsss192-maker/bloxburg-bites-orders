-- 1. Staff profiles: public-facing username per staff member
CREATE TABLE public.staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_profiles_username_key ON public.staff_profiles (lower(username));

GRANT SELECT ON public.staff_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read staff usernames"
  ON public.staff_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage staff profiles"
  ON public.staff_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff update own profile"
  ON public.staff_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER staff_profiles_set_updated_at
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.staff_profiles (user_id, username, display_name)
VALUES ('bed78334-8dd9-4ac1-a813-58a00f58347f', 'Hellosavagesavage79', 'Panda Bites HQ');

-- 2. Menu item permissions: admins see all + delete all, but only edit their own
DROP POLICY IF EXISTS "Admins manage all items" ON public.menu_items;

CREATE POLICY "Admins manage own items"
  ON public.menu_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND owner_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND owner_id = auth.uid());

CREATE POLICY "Admins delete any item"
  ON public.menu_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Chat read tracking for staff unread badges
CREATE TABLE public.order_message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (order_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_message_reads TO authenticated;
GRANT ALL ON public.order_message_reads TO service_role;

ALTER TABLE public.order_message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own read markers"
  ON public.order_message_reads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER order_message_reads_set_updated_at
  BEFORE UPDATE ON public.order_message_reads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4. Live chat updates
ALTER TABLE public.order_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;

-- 5. Public chef menu index (admin pinned first, then oldest menu first)
CREATE OR REPLACE FUNCTION public.get_public_chefs()
RETURNS TABLE(owner_id uuid, username text, is_admin boolean, first_item_at timestamp with time zone, item_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mi.owner_id,
         COALESCE(NULLIF(sp.username, ''), 'Chef') AS username,
         public.has_role(mi.owner_id, 'admin'::app_role) AS is_admin,
         MIN(mi.created_at) AS first_item_at,
         COUNT(*)::integer AS item_count
  FROM public.menu_items mi
  LEFT JOIN public.staff_profiles sp ON sp.user_id = mi.owner_id
  WHERE mi.is_active = true AND mi.owner_id IS NOT NULL
  GROUP BY mi.owner_id, sp.username
  ORDER BY public.has_role(mi.owner_id, 'admin'::app_role) DESC, MIN(mi.created_at) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_chefs() TO anon, authenticated;

-- 6. Public deals board
CREATE OR REPLACE FUNCTION public.get_public_discounts()
RETURNS TABLE(
  id uuid, owner_id uuid, chef_username text, is_admin boolean,
  name text, code text, discount_type text, value integer,
  is_automatic boolean, ends_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cd.id, cd.owner_id,
         COALESCE(NULLIF(sp.username, ''), 'Chef') AS chef_username,
         public.has_role(cd.owner_id, 'admin'::app_role) AS is_admin,
         cd.name, cd.code, cd.discount_type, cd.value, cd.is_automatic, cd.ends_at
  FROM public.chef_discounts cd
  LEFT JOIN public.staff_profiles sp ON sp.user_id = cd.owner_id
  WHERE cd.is_active = true
    AND (cd.starts_at IS NULL OR cd.starts_at <= now())
    AND (cd.ends_at IS NULL OR cd.ends_at > now())
  ORDER BY public.has_role(cd.owner_id, 'admin'::app_role) DESC, cd.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_discounts() TO anon, authenticated;
