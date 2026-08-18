-- When a customer has orders under discord_username but no members row
-- (legacy / orphaned orders), profile lookup used to return empty and show
-- "No Panda member yet" even though /history lists their orders.
--
-- open_or_get_member_profile:
--   1) returns existing profile if members row exists
--   2) if not, but orders exist for that username → ensure_member, link
--      orphan orders, grant rewards, then return profile
--   3) otherwise returns zero rows (truly new user)

CREATE OR REPLACE FUNCTION public.open_or_get_member_profile(_username text)
RETURNS TABLE(
  member_id uuid,
  username text,
  avatar_url text,
  delivered_count integer,
  giveaway_entries integer,
  roles text[],
  rewards jsonb,
  bs_owed integer,
  bs_paid integer,
  bs_spent_priority integer,
  bs_spent_orders integer,
  pickup_hours integer,
  priority_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key text := lower(trim(coalesce(_username, '')));
  mid uuid;
  has_orders boolean;
BEGIN
  IF length(key) < 2 THEN
    RETURN;
  END IF;

  SELECT m.id INTO mid
  FROM public.members m
  WHERE m.username_key = key;

  IF mid IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE lower(trim(o.discord_username)) = key
    ) INTO has_orders;

    IF NOT has_orders THEN
      RETURN;
    END IF;

    mid := public.ensure_member(_username);
  END IF;

  -- Attach any orphan orders for this username
  UPDATE public.orders o
  SET member_id = mid
  WHERE lower(trim(o.discord_username)) = key
    AND o.member_id IS NULL;

  -- Refresh delivered_count + milestone rewards from linked orders
  PERFORM public.grant_panda_rewards(mid);

  RETURN QUERY
  SELECT *
  FROM public.get_member_profile(_username);
END;
$$;

REVOKE ALL ON FUNCTION public.open_or_get_member_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_or_get_member_profile(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.open_or_get_member_profile(text) IS
  'Public profile open: creates/links member from existing orders when needed, then returns get_member_profile.';
