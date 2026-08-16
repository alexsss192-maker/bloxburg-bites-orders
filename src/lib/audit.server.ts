import type { Json } from "@/integrations/supabase/types";

/**
 * Audit logging DISABLED to cut Supabase writes.
 * Every Skippe tool used to INSERT into panda_audit_log — that added up fast.
 * Re-enable by restoring the insert below if you need a compliance trail.
 */
export async function logPandaAction(_input: {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}) {
  // no-op — was: supabaseAdmin.from("panda_audit_log").insert(...)
  return;
}
