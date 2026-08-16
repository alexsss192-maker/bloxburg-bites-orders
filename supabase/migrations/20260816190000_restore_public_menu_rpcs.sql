-- Restore public storefront RPCs that the menu depends on.
-- This is intentionally idempotent so it is safe to run against an existing database.

CREATE OR REPLACE FUNCTION public.get_public_chefs()
RETURNS TABLE(
  owner_id uuid,
  username text,
  is_admin boolean,
  first_item_at timestamp with time zone,
  item_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mi.owner_id,
    COALESCE(NULLIF(sp.username, ''), 'Chef') AS username,
    public.has_role(mi.owner_id, 'admin'::app_role) AS is_admin,
    MIN(mi.created_at) AS first_item_at,
    COUNT(*)::integer AS item_count
  FROM public.menu_items mi
  LEFT JOIN public.staff_profiles sp ON sp.user_id = mi.owner_id
  WHERE mi.is_active = true
    AND mi.owner_id IS NOT NULL
  GROUP BY mi.owner_id, sp.username
  ORDER BY
    public.has_role(mi.owner_id, 'admin'::app_role) DESC,
    MIN(mi.created_at) ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_chefs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_chefs()
  TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_public_discounts()
RETURNS TABLE(
  id uuid,
  owner_id uuid,
  chef_username text,
  is_admin boolean,
  name text,
  code text,
  discount_type text,
  value integer,
  is_automatic boolean,
  ends_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cd.id,
    cd.owner_id,
    COALESCE(NULLIF(sp.username, ''), 'Chef') AS chef_username,
    public.has_role(cd.owner_id, 'admin'::app_role) AS is_admin,
    cd.name,
    cd.code,
    cd.discount_type,
    cd.value,
    cd.is_automatic,
    cd.ends_at
  FROM public.chef_discounts cd
  LEFT JOIN public.staff_profiles sp ON sp.user_id = cd.owner_id
  WHERE cd.is_active = true
    AND (cd.starts_at IS NULL OR cd.starts_at <= now())
    AND (cd.ends_at IS NULL OR cd.ends_at > now())
  ORDER BY
    public.has_role(cd.owner_id, 'admin'::app_role) DESC,
    cd.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_discounts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_discounts()
  TO anon, authenticated, service_role;
