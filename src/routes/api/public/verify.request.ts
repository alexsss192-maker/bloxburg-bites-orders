import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

export const Route = createFileRoute("/api/public/verify/request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { findGuildMember, sendDm, avatarUrl, GuildUnavailableError } = await import("@/lib/discord.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: { username?: string };
        try {
          body = (await request.json()) as { username?: string };
        } catch {
          return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
        }
        const username = (body.username ?? "").trim();
        if (username.length < 2 || username.length > 64) {
          return Response.json({ ok: false, error: "Enter a valid Discord username or ID" }, { status: 400 });
        }

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

        // Rate limit: max 5 requests per Discord id in last 15 min (checked after resolving)
        let found: Awaited<ReturnType<typeof findGuildMember>>;
        try {
          found = await findGuildMember(username);
        } catch (e) {
          if (e instanceof GuildUnavailableError) {
            return Response.json({ ok: false, error: e.message }, { status: 503 });
          }
          throw e;
        }
        if (!found) {
          return Response.json({ ok: false, error: "Discord user not found" }, { status: 404 });
        }
        if (!found.inGuild) {
          return Response.json(
            { ok: false, error: "You must join the Panda Bites Discord server first.", needs_join: true },
            { status: 403 },
          );
        }

        // Rate limit check
        const { data: recent } = await supabaseAdmin
          .from("discord_verifications" as never)
          .select("id, created_at")
          .eq("discord_id", found.user.id)
          .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
        if (Array.isArray(recent) && recent.length >= 5) {
          return Response.json({ ok: false, error: "Too many attempts. Try again in 15 min." }, { status: 429 });
        }

        // Generate 6-digit code
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = createHash("sha256").update(code).digest("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const { error: insErr } = await supabaseAdmin.from("discord_verifications" as never).insert({
          discord_id: found.user.id,
          code_hash: codeHash,
          expires_at: expiresAt,
          last_sent_at: new Date().toISOString(),
          ip,
        } as never);
        if (insErr) return Response.json({ ok: false, error: insErr.message }, { status: 500 });

        const dmResult = await sendDm(
          found.user.id,
          `🐼 **Panda Bites** verification code: **${code}**\n\nEnter this on the site within 5 minutes. If you didn't request this, ignore this DM.`,
        );
        if (!dmResult.ok) {
          return Response.json(
            {
              ok: false,
              error: "We couldn't DM you. Enable DMs from server members in Discord privacy settings, then try again.",
            },
            { status: 502 },
          );
        }

        return Response.json({
          ok: true,
          discord_id: found.user.id,
          username: found.user.username,
          avatar_url: avatarUrl(found.user),
        });
      },
    },
  },
});