import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncDiscordStaffRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readCookie, verifyPayload, VERIFY_COOKIE } = await import("@/lib/verify-cookie.server");
    const { getGuildStaffRoles } = await import("@/lib/discord.server");
    const token = readCookie(getRequestHeader("cookie") ?? null, VERIFY_COOKIE);
    const verified = verifyPayload(token);
    if (!verified) throw new Error("Verify your Discord account before signing into the staff portal.");

    const discordRoles = await getGuildStaffRoles(verified.discord_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles" as never).delete().eq("user_id", context.userId);
    if (discordRoles.length > 0) {
      const rows = discordRoles.map((role) => ({ user_id: context.userId, role }));
      const { error } = await supabaseAdmin.from("user_roles" as never).insert(rows as never);
      if (error) throw new Error(error.message);
    }

    return {
      roles: discordRoles,
      isAdmin: discordRoles.includes("admin"),
      isChef: discordRoles.includes("chef"),
    };
  });