import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logPandaAction } from "@/lib/audit.server";

const imageSchema = z.object({
  data_url: z.string().max(6_500_000), // ~5MB base64
});

export const SKIPPE_MODES = ["auto", "lite_25", "lite_31"] as const;
export type SkippeMode = (typeof SKIPPE_MODES)[number];

const MODEL_BY_MODE: Record<Exclude<SkippeMode, "auto">, string> = {
  lite_25: "google/gemini-2.5-flash-lite",
  lite_31: "google/gemini-3.1-flash-lite",
};

export const SKIPPE_MODEL_LABELS: Record<string, string> = {
  "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
};

/** Auto picks the cheap model for light jobs and escalates on heavy scan batches. */
function resolveModel(mode: SkippeMode, imageCount: number, message: string) {
  if (mode !== "auto") return { model: MODEL_BY_MODE[mode], auto: false };
  const heavy = imageCount >= 7 || message.length > 600 || /every|all of (them|these)|bulk|whole (fridge|menu)/i.test(message);
  return { model: heavy ? MODEL_BY_MODE.lite_31 : MODEL_BY_MODE.lite_25, auto: true };
}

const pandaInput = z.object({
  message: z.string().trim().max(2000),
  images: z.array(imageSchema).max(9).default([]),
  mode: z.enum(SKIPPE_MODES).default("auto"),
});

type MenuItem = { id: string; name: string; stock: number; is_active: boolean };

async function loadChefMenu(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}): Promise<MenuItem[]> {
  const { data, error } = await context.supabase
    .from("menu_items")
    .select("id,name,stock,is_active")
    .eq("owner_id", context.userId)
    .eq("category", "non_seasonal");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MenuItem[];
}

async function doWebSearch(query: string): Promise<string> {
  // Use DuckDuckGo instant answer as a lightweight web-search fallback (no key needed).
  try {
    const res = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`,
      { headers: { "User-Agent": "PandaBites/1.0" } },
    );
    if (!res.ok) return "";
    const data = (await res.json()) as {
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string; Result?: string }>;
    };
    const chunks: string[] = [];
    if (data.AbstractText) chunks.push(data.AbstractText);
    for (const t of (data.RelatedTopics ?? []).slice(0, 5)) {
      if (t.Text) chunks.push(t.Text);
    }
    return chunks.join("\n").slice(0, 2000);
  } catch {
    return "";
  }
}

type PandaAction =
  | { type: "add_item"; name: string; stock: number }
  | { type: "update_stock"; name: string; stock: number }
  | { type: "set_active"; name: string; stock: number; active?: boolean };

type PandaResponse = { reply: string; actions: PandaAction[]; needs_web_search: string | null };

function safeParseJson(text: string): PandaResponse | null {
  // Extract JSON object from potentially fenced response
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Partial<PandaResponse>;
    return {
      reply: typeof raw.reply === "string" ? raw.reply : "",
      actions: Array.isArray(raw.actions) ? (raw.actions as PandaAction[]) : [],
      needs_web_search: typeof raw.needs_web_search === "string" ? raw.needs_web_search : null,
    };
  } catch {
    return null;
  }
}

async function callPanda(args: {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
  images: Array<{ data_url: string }>;
  model: string;
}): Promise<PandaResponse> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: args.userText || "(scan these images)" }];
  for (const img of args.images) {
    userContent.push({ type: "image_url", image_url: { url: img.data_url } });
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: args.systemPrompt },
        ...args.history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("Skippe is over capacity — try again in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Skippe call failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseJson(text);
  if (!parsed) return { reply: text || "I couldn't structure a reply — try again.", actions: [], needs_web_search: null };
  return parsed;
}

function buildSystemPrompt(menu: MenuItem[]) {
  return [
    "You are Skippe — a friendly AI menu assistant for chefs on Panda Bites (a Bloxburg food shop).",
    "You help chefs manage names and stock by looking at menu or fridge photos.",
    "",
    "HARD RULES you MUST follow:",
    "- You NEVER set, invent, change, or suggest a specific numeric price. Chefs set all prices.",
    "- When you 'add_item', the price is always 0 and the item will be hidden until the chef sets a price.",
    "- Never provide, look up, estimate, or recommend prices or price ranges. Tell the chef that only they can set prices in the menu editor.",
    "- If images clearly show an item already on the menu, use update_stock (do NOT create a duplicate).",
    "- Item names should match the chef's existing naming style (short, capitalized).",
    "",
    "Current chef menu (JSON):",
    JSON.stringify(menu.map((m) => ({ name: m.name, stock: m.stock, active: m.is_active }))),
    "",
    "OUTPUT: Reply ONLY with a JSON object of this exact shape:",
    '{"reply": string, "actions": [ {"type":"add_item","name":string,"stock":number} | {"type":"update_stock","name":string,"stock":number} ], "needs_web_search": string | null }',
    "- 'reply' is the chatty message the chef sees (markdown ok, short).",
    "- 'actions' is what you want the app to change (add_item creates a hidden zero-price item; update_stock only works on the chef's own items).",
     "- Use web search only for non-price menu facts. Never request a price search.",
  ].join("\n");
}

export const pandaChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pandaInput.parse(d))
  .handler(async ({ context, data }) => {
    // Ensure staff (chef or admin)
    const { data: roleRows } = await context.supabase
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((roleRows as unknown as Array<{ role: string }> | null) ?? []).map((r) => r.role);
    if (!roles.includes("chef") && !roles.includes("admin")) throw new Error("Chef or admin only");

    const actorEmail = (context.claims as { email?: string } | undefined)?.email ?? null;

    const menu = await loadChefMenu(context);
    const systemPrompt = buildSystemPrompt(menu);

    // First model call
    let parsed = await callPanda({
      systemPrompt,
      history: data.history,
      userText: data.message,
      images: data.images,
    });

    // If model requested a web search, do it and re-ask
    if (parsed.needs_web_search) {
      const results = await doWebSearch(parsed.needs_web_search);
      const followupHistory = [
        ...data.history,
        { role: "user" as const, content: data.message || "(images)" },
        { role: "assistant" as const, content: `Let me check the web for "${parsed.needs_web_search}"...` },
      ];
      parsed = await callPanda({
        systemPrompt,
        history: followupHistory,
         userText: `Web search results for "${parsed.needs_web_search}":\n${results || "(no results)"}\n\nUse these to answer the chef's original non-price question. Never provide or recommend prices.`,
        images: [], // no images on retry
      });
      parsed.needs_web_search = null;
    }

    // Apply actions (create hidden 0-price item / update stock)
    const applied: Array<{ type: string; name: string; stock: number; itemId?: string; ok: boolean; error?: string }> = [];
    for (const action of parsed.actions.slice(0, 20)) {
      const stock = Math.max(0, Math.min(1000000, Math.floor(action.stock)));
      const name = String(action.name).trim().slice(0, 100);
      if (!name) continue;

      const existing = menu.find((m) => m.name.toLowerCase() === name.toLowerCase());
      try {
        if (action.type === "update_stock" || existing) {
          if (!existing) {
            applied.push({ type: action.type, name, stock, ok: false, error: "Item not found" });
            continue;
          }
          const { error } = await context.supabase
            .from("menu_items" as never)
            .update({ stock } as never)
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          applied.push({ type: "update_stock", name: existing.name, stock, itemId: existing.id, ok: true });
          await logPandaAction({
            actorUserId: context.userId,
            actorEmail,
            action: "update_stock",
            targetType: "menu_item",
            targetId: existing.id,
            payload: { name: existing.name, previous_stock: existing.stock, new_stock: stock },
          });
        } else {
          // add_item — zero price, inactive
          const { data: row, error } = await context.supabase
            .from("menu_items" as never)
            .insert({
              name,
              description: "",
              price_bs: 0,
              stock,
              is_active: false,
              category: "non_seasonal",
              owner_id: context.userId,
            } as never)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          const newId = (row as unknown as { id: string }).id;
          applied.push({
            type: "add_item",
            name,
            stock,
            itemId: newId,
            ok: true,
          });
          await logPandaAction({
            actorUserId: context.userId,
            actorEmail,
            action: "add_item",
            targetType: "menu_item",
            targetId: newId,
            payload: { name, stock, price_bs: 0 },
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Failed";
        applied.push({ type: action.type, name, stock, ok: false, error: errMsg });
        await logPandaAction({
          actorUserId: context.userId,
          actorEmail,
          action: `${action.type}_failed`,
          targetType: "menu_item",
          payload: { name, stock, error: errMsg },
        });
      }
    }

    return { reply: parsed.reply, applied };
  });

// List Skippe audit entries for staff review.
const auditFilter = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  action: z.string().max(64).optional().nullable(),
  actor: z.string().max(64).optional().nullable(),
});

export const listPandaAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditFilter.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((roleRows as unknown as Array<{ role: string }> | null) ?? []).map((r) => r.role);
    if (!roles.includes("chef") && !roles.includes("admin")) throw new Error("Chef or admin only");

    let q = context.supabase
      .from("panda_audit_log" as never)
      .select("id, actor_user_id, actor_email, action, target_type, target_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor) q = q.ilike("actor_email", `%${data.actor}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const raw = (rows ?? []) as unknown as Array<{
      id: string;
      actor_user_id: string | null;
      actor_email: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      payload: unknown;
      created_at: string;
    }>;
    return {
      entries: raw.map((r) => ({
        id: r.id,
        actor_user_id: r.actor_user_id,
        actor_email: r.actor_email,
        action: r.action,
        target_type: r.target_type,
        target_id: r.target_id,
        payload_json: JSON.stringify(r.payload ?? {}),
        created_at: r.created_at,
      })),
    };
  });