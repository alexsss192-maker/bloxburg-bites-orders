
-- Add owner_id to menu_items for chef-owned menus
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS menu_items_owner_id_idx ON public.menu_items(owner_id);

-- Replace admin-only staff manage policy with owner/admin split
DROP POLICY IF EXISTS "Admins manage items" ON public.menu_items;

CREATE POLICY "Admins manage all items"
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Chefs manage own items"
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'chef') AND owner_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'chef') AND owner_id = auth.uid());
