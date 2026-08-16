-- Internal helpers / trigger functions: not callable via the API at all
REVOKE EXECUTE ON FUNCTION public.ensure_member(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_panda_rewards(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_reward_priority(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_menu_items_stock_alert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_orders_rewards() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_order_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_orders_for_discord(text) FROM PUBLIC, anon, authenticated;

-- Role helpers: used inside RLS policies; only signed-in users need direct execute
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Staff-only routines: signed-in only (bodies still enforce role checks)
REVOKE EXECUTE ON FUNCTION public.cancel_fulfillment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_fulfillment(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_bs_payout_paid(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_bs_payout_paid(uuid, boolean) TO authenticated, service_role;

-- Intentionally public storefront routines: make grants explicit
REVOKE EXECUTE ON FUNCTION public.ack_member_rewards(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_member_rewards(text, integer) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_expired_discount(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_discount(text, uuid) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_member_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_profile(text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_order_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_messages(uuid) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_order_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_public(uuid) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_orders_for_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_for_username(text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_priority_levels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_priority_levels() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_public_chefs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_chefs() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_public_discounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_discounts() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_unseen_member_rewards(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unseen_member_rewards(text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_claimable_expired_discounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_claimable_expired_discounts(text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.place_order(text, text, jsonb, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, jsonb, text, text, jsonb) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.post_order_message(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_order_message(uuid, text, text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.preview_order_total(jsonb, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_order_total(jsonb, text, text, jsonb) TO anon, authenticated, service_role;
