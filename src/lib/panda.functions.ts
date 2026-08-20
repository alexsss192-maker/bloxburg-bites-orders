import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SKIPPE_MODES,
  SKIPPE_MODEL_LABELS,
} from "@/lib/skippe-models";

/**
 * Kitchen tools stay ON when this matches (menu edit, discounts, orders, …).
 * Tools turn OFF only for pure “look at this screenshot” chats (no action words)
 * so vision scans skip the database. All create/update/delete tools still exist.
 */
const KITCHEN_ACTION_RE =
  /\b(discount|order|claim|menu|stock|message|list|create|make|add|mark|set|priority|tier|delete|update|price|fee|bulk|edit|change|rename|remove|put|save|enable|disable|activate|deactivate|prepare|ready|deliver|cancel|item|items|them)\b/i;

export type { SkippeMode } from "@/lib/skippe-models";

export {
  SKIPPE_MODES,
  SKIPPE_MODEL_LABELS,
  SKIPPE_MODE_OPTIONS,
  modelShowsThinking,
} from "@/lib/skippe-models";

/** Local type — do NOT import from skippe.server (keeps LLM/DB code off the client graph). */
export type SkippeToolRun = {
  name: string;
  ok: boolean;
  summary: string;
  detail?: string;
};

export type SkippeSavedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_count: number;
  model: string | null;
  created_at: string;
};

export type SkippeReply = {
  reply: string;
  thinking: string;
  runs: SkippeToolRun[];
  model: string;
  model_label: string;
  auto: boolean;
};

const pandaInput = z.object({
  message: z.string().trim().max(2000),

  images: z
    .array(
      z.object({
        data_url: z.string().max(6_500_000),
      }),
    )
    .max(3)
    .default([]),

  mode: z
    .enum(SKIPPE_MODES)
    .default("lite_25"),

  /** Client-side chat history (localStorage). No DB read. */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

/**
 * Soft reply helper — pandaChat must NEVER throw (throws become bare HTTP 500).
 */
function skippeFail(reply: string, model = "none"): SkippeReply {
  return {
    reply,
    thinking: "",
    runs: [],
    model,
    model_label: SKIPPE_MODEL_LABELS[model] ?? "Skippe",
    auto: false,
  };
}

/**
 * pandaChat — no auth middleware, no zod throw.
 * Auth + validation run inside and always return SkippeReply.
 */
export const pandaChat = createServerFn({
  method: "POST",
}).handler(async (ctx): Promise<SkippeReply> => {
  try {
    // ── 1) Soft-parse input (never throw Zod errors as HTTP 500) ──
    const parsed = pandaInput.safeParse(
      // TanStack may pass { data: payload } or payload directly
      (ctx as { data?: unknown }).data ?? ctx,
    );
    if (!parsed.success) {
      return skippeFail(
        `⚠️ Bad Skippe request: ${parsed.error.issues[0]?.message ?? "invalid input"}`,
      );
    }
    const data = parsed.data;

    // ── 2) Soft auth (copy of requireSupabaseAuth, but returns reply on fail) ──
    const SUPABASE_URL = process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return skippeFail(
        "⚠️ Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY — connect Supabase in Lovable Cloud.",
      );
    }

    const { getRequest } = await import("@tanstack/react-start/server");
    const { createClient } = await import("@supabase/supabase-js");
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return skippeFail(
        "⚠️ Not signed in — refresh the page and log into staff again.",
      );
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || token.split(".").length !== 3) {
      return skippeFail("⚠️ Invalid session — sign out and back into staff.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: claimData, error: claimErr } =
      await supabase.auth.getClaims(token);
    if (claimErr || !claimData?.claims?.sub) {
      return skippeFail("⚠️ Session expired — sign in again.");
    }
    const userId = claimData.claims.sub as string;
    const actorEmail =
      (claimData.claims as { email?: string }).email ?? null;

    // ── 3) Staff gate ──
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", userId);
    if (roleError) {
      return skippeFail(
        `⚠️ Could not verify staff role: ${roleError.message}`,
      );
    }
    const roles =
      (roleRows as unknown as Array<{ role: string }> | null)?.map(
        (r) => r.role,
      ) ?? [];
    const isAdmin = roles.includes("admin");
    const isChef = roles.includes("chef");
    if (!isAdmin && !isChef) {
      return skippeFail("⚠️ Chef or admin only — Skippe is for staff.");
    }

    const staffName = actorEmail?.split("@")[0] || "Chef";

    // ── 4) Load Skippe engine (dynamic — keeps it off the public graph) ──
    let buildSkippePrompt: any;
    let resolveModel: any;
    let runSkippeTurn: any;
    try {
      const mod = await import("@/lib/skippe.server");
      buildSkippePrompt = mod.buildSkippePrompt;
      resolveModel = mod.resolveModel;
      runSkippeTurn = mod.runSkippeTurn;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return skippeFail(`⚠️ Skippe module failed to load: ${msg}`);
    }

    const history = (data.history ?? []).slice(-3);
    const images = (data.images ?? []).slice(0, 3);
    const visionOnly =
      images.length > 0 && !KITCHEN_ACTION_RE.test(data.message || "");

    const { model, auto } = resolveModel(
      data.mode,
      images.length,
      data.message,
    );

    try {
      const turn = await runSkippeTurn({
        model,
        instructions: buildSkippePrompt({
          staffName,
          isAdmin,
          withVision: images.length > 0,
        }),
        history,
        userText: data.message,
        images,
        staffName,
        toolsEnabled: !visionOnly,
        ctx: {
          supabase: supabase as never,
          userId,
          isAdmin,
          actorEmail,
          _cache: new Map(),
        },
      });

      const reply =
        turn.reply ||
        (turn.runs.length > 0
          ? turn.runs
              .map((r: SkippeToolRun) => `${r.ok ? "✅" : "⚠️"} ${r.summary}`)
              .join("\n")
          : "I couldn't put a reply together — try asking again?");

      return {
        reply,
        thinking: turn.thinking ?? "",
        runs: turn.runs ?? [],
        model,
        model_label: SKIPPE_MODEL_LABELS[model] ?? model,
        auto: Boolean(auto),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return skippeFail(
        msg.startsWith("Skippe") ? msg : `Skippe hit a problem: ${msg}`,
        model,
      );
    }
  } catch (err) {
    // Absolute last resort — still HTTP 200 with a message
    const msg = err instanceof Error ? err.message : String(err);
    return skippeFail(`⚠️ Skippe crashed: ${msg}`);
  }
});

export const listSkippeChat =
  createServerFn({
    method: "GET",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(async ({ context }) => {
      const {
        data,
        error,
      } = await context.supabase
        .from(
          "skippe_messages" as never,
        )
        .select(
          "id, role, content, image_count, model, created_at",
        )
        .eq(
          "owner_id",
          context.userId,
        )
        .order("created_at", {
          ascending: true,
        })
        .limit(200);

      // Table may not exist / RLS — never 500 the Skippe page for history.
      if (error) return [] as SkippeSavedMessage[];

      return (data ?? []) as unknown as SkippeSavedMessage[];
    });

export const clearSkippeChat =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .handler(async ({ context }) => {
      const {
        error,
      } = await context.supabase
        .from(
          "skippe_messages" as never,
        )
        .delete()
        .eq(
          "owner_id",
          context.userId,
        );

      if (error) {
        // Don't 500 — chat clear is best-effort (table may be missing)
        return { ok: false as const, error: error.message };
      }

      return {
        ok: true as const,
      };
    });

export const listPandaAudit =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator((d: unknown) =>
      z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .default(50),

          action: z
            .string()
            .max(64)
            .optional()
            .nullable(),

          actor: z
            .string()
            .max(64)
            .optional()
            .nullable(),
        })
        .parse(d ?? {}),
    )
    .handler(async ({ context, data }) => {
      const {
        data: roleRows,
      } = await context.supabase
        .from("user_roles" as never)
        .select("role")
        .eq(
          "user_id",
          context.userId,
        );

      const roles =
        (
          (roleRows as unknown as Array<{
            role: string;
          }> | null) ?? []
        ).map(
          (r) => r.role,
        );

      if (
        !roles.includes("admin")
      ) {
        throw new Error(
          "Admins only",
        );
      }


      let q =
        context.supabase
          .from(
            "panda_audit_log" as never,
          )
          .select(
            "id, actor_user_id, actor_email, action, target_type, target_id, payload, created_at",
          )
          .order("created_at", {
            ascending: false,
          })
          .limit(data.limit);

      if (data.action) {
        q = q.ilike(
          "action",
          `%${data.action}%`,
        );
      }

      if (data.actor) {
        q = q.ilike(
          "actor_email",
          `%${data.actor}%`,
        );
      }

      const {
        data: rows,
        error,
      } = await q;

      if (error) {
        throw new Error(
          error.message,
        );
      }

      const raw =
        (
          rows ?? []
        ) as unknown as Array<{
          id: string;
          actor_user_id:
            | string
            | null;
          actor_email:
            | string
            | null;
          action: string;
          target_type:
            | string
            | null;
          target_id:
            | string
            | null;
          payload: unknown;
          created_at: string;
        }>;

      return {
        entries: raw.map(
          (r) => ({
            id: r.id,

            actor_user_id:
              r.actor_user_id,

            actor_email:
              r.actor_email,

            action:
              r.action,

            target_type:
              r.target_type,

            target_id:
              r.target_id,

            payload_json:
              JSON.stringify(
                r.payload ?? {},
              ),

            created_at:
              r.created_at,
          }),
        ),
      };
    });
