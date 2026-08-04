import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncDiscordStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readVerifiedSession } = await import("@/lib/verify-cookie.server");
    const { getGuildStaffRoles } = await import("@/lib/discord.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const verified = readVerifiedSession(getRequestHeader("cookie") ?? null);

    // Roles granted by hand (source = 'manual', e.g. an owner-provisioned admin)
    // are never touched here — only the Discord-derived set is replaced.
    let discordRoles: Array<"admin" | "chef"> = [];
    if (verified) {
      discordRoles = (await getGuildStaffRoles(verified.discord_id)) as Array<"admin" | "chef">;
      await supabaseAdmin
        .from("user_roles" as never)
        .delete()
        .eq("user_id", context.userId)
        .eq("source", "discord");
      if (discordRoles.length > 0) {
        const rows = discordRoles.map((role) => ({ user_id: context.userId, role, source: "discord" }));
        const { error } = await supabaseAdmin
          .from("user_roles" as never)
          .upsert(rows as never, { onConflict: "user_id,role" });
        if (error) throw new Error(error.message);
      }
    }

    const { data: manual } = await supabaseAdmin
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    const roles = Array.from(
      new Set([...(discordRoles as string[]), ...(((manual ?? []) as Array<{ role: string }>).map((r) => r.role))]),
    );

    return {
      roles,
      isAdmin: roles.includes("admin"),
      isChef: roles.includes("chef"),
      discordLinked: Boolean(verified),
    };
  });