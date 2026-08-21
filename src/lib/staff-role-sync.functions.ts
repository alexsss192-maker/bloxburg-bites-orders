import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff roles from user_roles only (admin-granted).
 * No Discord verification / guild role sync.
 *
 * Client should cache the result in sessionStorage (see getMyRolesCached helper
 * pattern in menu.functions / staff UI) to avoid repeat DB hits.
 */
export const syncDiscordStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Kept export name for call-site compatibility — does NOT touch Discord.
    const { data: stored } = await context.supabase
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    const roles = Array.from(
      new Set(
        ((stored ?? []) as Array<{ role: string }>).map((r) => r.role),
      ),
    );

    return {
      roles,
      isAdmin: roles.includes("admin"),
      isChef: roles.includes("chef"),
      source: "user_roles" as const,
      discord: false as const,
    };
  });
