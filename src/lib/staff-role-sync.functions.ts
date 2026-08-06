import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff roles now live entirely in user_roles (granted by an admin, or synced
 * previously from Discord). Nothing here depends on a customer session.
 */
export const syncDiscordStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: stored } = await supabaseAdmin
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    const roles = Array.from(new Set(((stored ?? []) as Array<{ role: string }>).map((r) => r.role)));

    return {
      roles,
      isAdmin: roles.includes("admin"),
      isChef: roles.includes("chef"),
    };
  });