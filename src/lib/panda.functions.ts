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
    // Keep only real image data URLs (blank / non-image payloads make models say "no images")
    const images = (data.images ?? [])
      .slice(0, 3)
      .filter((img: { data_url?: string }) => {
        const u = (img?.data_url || "").trim();
        return (
          u.startsWith("data:image/") ||
          u.startsWith("https://") ||
          u.startsWith("http://")
        );
      });
    // When chef only drops frames, give a clear fridge-scan instruction
    // (must include action words so tools stay ON — empty message used to
    // set visionOnly=true and the model would *pretend* to create items).
    const userText =
      (data.message || "").trim() ||
      (images.length > 0
        ? "Look at these images. Restock ONLY if this is the Bloxburg fridge View Content panel (title Content, qty numbers, blue Take buttons). Read each row name+qty and create/update menu stock. If Lovable/dashboard/anything else: one-line refuse, no tools."
        : "");

    // Tools OFF only for pure look-at-this chats with no kitchen intent.
    // Always check the *effective* userText (including the default above).
    const visionOnly =
      images.length > 0 && !KITCHEN_ACTION_RE.test(userText);

    const { model, auto } = resolveModel(
      data.mode,
      images.length,
      userText,
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
        userText,
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

/** Skippe history is browser localStorage only — no DB. */
export const listSkippeChat = createServerFn({
  method: "GET",
}).handler(async () => [] as SkippeSavedMessage[]);

/** Clear is client-side (localStorage); server is a no-op. */
export const clearSkippeChat = createServerFn({
  method: "POST",
}).handler(async () => ({ ok: true as const }));

/** Audit log DB removed — no reads. */
export const listPandaAudit = createServerFn({
  method: "POST",
}).handler(async () => ({ entries: [] as Array<Record<string, unknown>> }));
