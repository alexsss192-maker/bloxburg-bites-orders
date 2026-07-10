import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const RESEND_COOLDOWN_SEC = 60;

export const Route = createFileRoute("/api/public/verify/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { sendDm } = await import("@/lib/discord.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: { discord_id?: string };
        try {
          body = (await request.json()) as { discord_id?: string };
        } catch {
          return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
        }
        const discordId = String(body.discord_id ?? "");
        if (!/^\d{15,20}$/.test(discordId)) {
          return Response.json({ ok: false, error: "Invalid Discord id" }, { status: 400 });
        }

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

        // Cooldown check
        const { data: latest } = await supabaseAdmin
          .from("discord_verifications" as never)
          .select("id, last_sent_at, created_at")
          .eq("discord_id", discordId)
          .order("created_at", { ascending: false })
          .limit(1);
        const row = Array.isArray(latest)
          ? (latest[0] as { last_sent_at?: string; created_at?: string } | undefined)
          : undefined;
        if (row?.last_sent_at) {
          const ageMs = Date.now() - new Date(row.last_sent_at).getTime();
          if (ageMs < RESEND_COOLDOWN_SEC * 1000) {
            const retry = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - ageMs) / 1000);
            return Response.json(
              { ok: false, error: `Please wait ${retry}s before resending`, retry_after: retry },
              { status: 429 },
            );
          }
        }

        // Hourly cap: max 5 sends per hour
        const { data: recent } = await supabaseAdmin
          .from("discord_verifications" as never)
          .select("id")
          .eq("discord_id", discordId)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
        if (Array.isArray(recent) && recent.length >= 5) {
          return Response.json({ ok: false, error: "Too many resends. Try again later." }, { status: 429 });
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = createHash("sha256").update(code).digest("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const { error: insErr } = await supabaseAdmin.from("discord_verifications" as never).insert({
          discord_id: discordId,
          code_hash: codeHash,
          expires_at: expiresAt,
          last_sent_at: new Date().toISOString(),
          ip,
        } as never);
        if (insErr) return Response.json({ ok: false, error: insErr.message }, { status: 500 });

        const dmResult = await sendDm(
          discordId,
          `🐼 **Panda Bites** new verification code: **${code}**\n\nValid for 5 minutes.`,
        );
        if (!dmResult.ok) {
          return Response.json(
            { ok: false, error: "We couldn't DM you. Enable DMs from server members and try again." },
            { status: 502 },
          );
        }

        return Response.json({ ok: true, cooldown: RESEND_COOLDOWN_SEC });
      },
    },
  },
});