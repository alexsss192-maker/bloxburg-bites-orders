DROP POLICY IF EXISTS "Staff can read audit log" ON public.panda_audit_log;
DROP POLICY IF EXISTS "Staff read audit log" ON public.panda_audit_log;
DROP POLICY IF EXISTS "staff_read_audit_log" ON public.panda_audit_log;
CREATE POLICY "Admins can read audit log" ON public.panda_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Internal helpers: not part of the public API surface
REVOKE EXECUTE ON FUNCTION public.ensure_member(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_panda_rewards(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_reward_priority(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_menu_items_stock_alert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_orders_rewards() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_order_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_validate_fulfillment_transition() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_orders_for_discord(text) FROM anon, authenticated;

-- Staff-only routines: signed-in staff only (function bodies already check roles)
REVOKE EXECUTE ON FUNCTION public.cancel_fulfillment(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_bs_payout_paid(uuid, boolean) FROM anon;
