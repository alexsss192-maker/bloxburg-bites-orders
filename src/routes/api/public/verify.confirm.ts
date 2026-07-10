import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

export const Route = createFileRoute("/api/public/verify/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { signVerifiedPayload, buildSetCookie } = await import("@/lib/verify-cookie.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: { discord_id?: string; code?: string; username?: string; avatar_url?: string | null };
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
        }
        const discordId = String(body.discord_id ?? "");
        const code = String(body.code ?? "").trim();
        if (!/^\d{15,20}$/.test(discordId) || !/^\d{6}$/.test(code)) {
          return Response.json({ ok: false, error: "Invalid code" }, { status: 400 });
        }

        const codeHash = createHash("sha256").update(code).digest("hex");

        const { data: rows } = await supabaseAdmin
          .from("discord_verifications" as never)
          .select("*")
          .eq("discord_id", discordId)
          .gte("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1);

        const row = Array.isArray(rows)
          ? (rows[0] as { id: string; code_hash: string; attempts: number } | undefined)
          : undefined;
        if (!row)
          return Response.json(
            { ok: false, error: "Code expired or not found. Tap Resend to get a new one.", expired: true },
            { status: 400 },
          );
        if (row.attempts >= 5) {
          return Response.json(
            { ok: false, error: "Too many attempts. Tap Resend to get a new code." },
            { status: 429 },
          );
        }
        if (row.code_hash !== codeHash) {
          await supabaseAdmin
            .from("discord_verifications" as never)
            .update({ attempts: row.attempts + 1 } as never)
            .eq("id", row.id);
          const left = Math.max(0, 5 - (row.attempts + 1));
          return Response.json(
            { ok: false, error: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`, attempts_left: left },
            { status: 400 },
          );
        }

        // Delete all outstanding codes for this user
        await supabaseAdmin.from("discord_verifications" as never).delete().eq("discord_id", discordId);

        // Upsert verified_users
        const username = String(body.username ?? "unknown");
        const avatarUrl = (body.avatar_url ?? null) as string | null;
        await supabaseAdmin
          .from("verified_users" as never)
          .upsert(
            { discord_id: discordId, username, avatar_url: avatarUrl, last_seen_at: new Date().toISOString() } as never,
            { onConflict: "discord_id" },
          );

        const token = signVerifiedPayload({ discord_id: discordId, username, avatar_url: avatarUrl });
        return new Response(JSON.stringify({ ok: true, username, avatar_url: avatarUrl, discord_id: discordId }), {
          status: 200,
          headers: { "content-type": "application/json", "set-cookie": buildSetCookie(token) },
        });
      },
    },
  },
});