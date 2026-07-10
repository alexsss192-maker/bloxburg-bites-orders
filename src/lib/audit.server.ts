import type { Json } from "@/integrations/supabase/types";

export async function logPandaAction(input: {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.from("panda_audit_log" as never).insert({
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      payload: (input.payload ?? {}) as unknown as Json,
    } as never);
  } catch (err) {
    // Never let audit failure break the primary action
    console.error("audit log failed", err);
  }
}