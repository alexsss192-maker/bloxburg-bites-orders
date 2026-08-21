import { MODEL_BY_MODE, MODEL_VENDOR, type SkippeMode } from "./skippe-models";
import { logPandaAction } from "@/lib/audit.server";
import { isPublicBulkChef } from "@/lib/bulk-department";

export type SkippeContext = {
  supabase: { from: (table: string) => any; rpc?: unknown };
  userId: string;
  isAdmin: boolean;
  actorEmail: string | null;
  /** Per-turn memo so list/own lookups are not repeated in the same Skippe turn. */
  _cache?: Map<string, unknown>;
};

function cacheGet<T>(ctx: SkippeContext, key: string): T | undefined {
  return ctx._cache?.get(key) as T | undefined;
}

function cacheSet<T>(ctx: SkippeContext, key: string, value: T): T {
  if (!ctx._cache) ctx._cache = new Map();
  ctx._cache.set(key, value);
  return value;
}

export type SkippeToolRun = {
  name: string;
  ok: boolean;
  summary: string;
  detail?: string;
};

export type SkippeTurn = {
  reply: string;
  thinking: string;
  runs: SkippeToolRun[];
  model: string;
};

/**
 * Auto prefers Gemini 2.5 Flash Lite for almost everything.
 * Escalates to Gemini 3.1 Flash Lite only for heavy multi-image / bulk scans.
 * GPT-5 Nano remains available as a manual mode pick.
 */
export function resolveModel(mode: SkippeMode, imageCount: number, message: string) {
  // Locked mode: never escalate — honor the chef's Cost picker exactly.
  if (mode !== "auto") return { model: MODEL_BY_MODE[mode], auto: false };

  // Auto only: escalate for big photo batches or explicit "scan everything" wording.
  // Do NOT match "bulk service fee" / "bulk fee" — that is a normal kitchen tool call.
  const heavyPattern =
    /\b(every\s+order|all of (them|these)|whole (fridge|menu|inventory)|scan (all|everything|every))\b/i;
  const heavy =
    imageCount >= 7 || message.length > 600 || heavyPattern.test(message);

  if (heavy) {
    return { model: MODEL_BY_MODE.lite_31, auto: true };
  }

  // Default: Gemini 2.5 Flash Lite — cheap, fast, kitchen-ready.
  return { model: MODEL_BY_MODE.lite_25, auto: true };
}

type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const nul = (t: string) => ({ type: [t, "null"] });

const obj = (props: Record<string, unknown>) => ({
  type: "object",
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});

const STATUSES = ["pending", "preparing", "ready", "delivered", "cancelled"];

export const SKIPPE_TOOLS: ToolDef[] = [
  {
    name: "list_menu_items",
    description:
      "List every menu item you own: id, name, current price (read-only), stock, category, and whether it is live. Use this before editing or deleting.",
    parameters: obj({}),
  },

  {
    name: "create_menu_item",
    description:
      "Create ONE menu item. name MUST be a real food from the image or an explicit dish name — NEVER the instruction sentence (never 'these menu items in the picture'). Price always B$0.",
    parameters: obj({
      name: { type: "string" },
      description: { type: "string" },
      stock: { type: "integer" },
      category: {
        type: "string",
        enum: ["non_seasonal", "seasonal"],
      },
      is_active: { type: "boolean" },
    }),
  },

  {
    name: "update_menu_item",
    description:
      "Edit one of your own menu items (name, description, stock, category, active). You CANNOT change price — never try. Pass null for anything you are not changing. For fridge restock: set stock to sellable qty (physical fridge count minus reserved quantities on pending/preparing/ready orders unless the chef corrected that ready items were already pulled from the fridge).",
    parameters: obj({
      item_id: { type: "string" },
      name: nul("string"),
      description: nul("string"),
      stock: nul("integer"),
      category: {
        type: ["string", "null"],
        enum: ["seasonal", "non_seasonal", null],
      },
      is_active: nul("boolean"),
    }),
  },

  {
    name: "delete_menu_item",
    description: "Delete a menu item by id. Look up the id with list_menu_items first.",
    parameters: obj({
      item_id: { type: "string" },
    }),
  },

  {
    name: "delete_all_my_menu_items",
    description:
      "Delete EVERY menu item you own in one call. Use when the chef says remove/clear/delete all my menu items before rebuilding from a fridge picture.",
    parameters: obj({}),
  },

  {
    name: "create_menu_items_batch",
    description:
      "PREFERRED for fridge/Content pictures: create many items in one call. Each name must be a food READ from the image (e.g. Pancakes), NEVER the chat sentence. Price always B$0. Pass items: [{name, stock, category, is_active}, ...].",
    parameters: obj({
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            stock: { type: "integer" },
            category: {
              type: "string",
              enum: ["non_seasonal", "seasonal"],
            },
            is_active: { type: "boolean" },
          },
          required: ["name", "stock", "category", "is_active"],
          additionalProperties: false,
        },
      },
    }),
  },

  {
    name: "get_bulk_service_fee",
    description:
      "Get your current Bulk / Fast Service fee. Only Bulk / Fast Service chefs and the house/admin kitchen can use this tool.",
    parameters: obj({}),
  },

  {
    name: "set_bulk_service_fee",
    description:
      "Set your Bulk / Fast Service fee and optional hover message shown at checkout. Only Bulk / Fast Service chefs and the house/admin kitchen may use this. fee_type percentage or fixed; value 0 clears the fee. fee_message is the customer-facing explanation (hover text).",
    parameters: obj({
      fee_type: {
        type: "string",
        enum: ["percentage", "fixed"],
      },
      value: {
        type: "integer",
      },
      fee_message: nul("string"),
    }),
  },

  {
    name: "list_orders",
    description:
      "List the orders assigned to YOU (newest first), including line-item names and quantities. Use status null for all open work, or filter by pending / preparing / ready / delivered / cancelled. CRITICAL for fridge restock: pending + preparing + ready orders still reserve ingredients — subtract those quantities from physical fridge counts before updating stock. Chefs may correct you: some already pulled items for 'ready' orders out of the fridge (stock already reduced); others still have ready-order items in the fridge. Ask once if ambiguous, then act.",
    parameters: obj({
      status: {
        type: ["string", "null"],
        enum: [...STATUSES, null],
      },
    }),
  },

  {
    name: "set_order_status",
    description:
      "Change the status of an order that is already assigned to you. This is how you CLAIM and progress orders. Common flow: pending → preparing (claim/start cooking) → ready → delivered. You can also cancel. Always use a real order_id from list_orders or get_order_details.",
    parameters: obj({
      order_id: { type: "string" },
      status: {
        type: "string",
        enum: STATUSES,
      },
    }),
  },

  {
    name: "get_order_details",
    description:
      "Get full details of one order (customer, note, line items with quantities and prices, current status). Prefer this when the chef mentions a specific order or wants a summary before acting.",
    parameters: obj({
      order_id: { type: "string" },
    }),
  },

  {
    name: "list_discounts",
    description: "List every discount you own (codes, automatic deals, active or not).",
    parameters: obj({}),
  },

  {
    name: "create_discount",
    description:
      "Create a discount on your own menu RIGHT NOW. For '10% off' / automatic deals: is_automatic true, code null, discount_type percentage, value 10. For code deals: is_automatic false + a short code. Always call this tool when the chef asks to make/create a discount — never just talk about it.",
    parameters: obj({
      name: { type: "string" },
      code: nul("string"),
      discount_type: {
        type: "string",
        enum: ["percentage", "fixed"],
      },
      value: { type: "integer" },
      is_automatic: { type: "boolean" },
      is_active: { type: "boolean" },
    }),
  },

  {
    name: "update_discount",
    description: "Edit one of your own discounts. Pass null for anything you are not changing.",
    parameters: obj({
      discount_id: { type: "string" },
      name: nul("string"),
      value: nul("integer"),
      code: nul("string"),
      is_automatic: nul("boolean"),
      is_active: nul("boolean"),
    }),
  },

  {
    name: "end_discount",
    description: "End a discount you own right now (turns it off and stamps the end time).",
    parameters: obj({
      discount_id: { type: "string" },
    }),
  },

  {
    name: "list_priority_levels",
    description:
      "List your priority tiers (low / mid / high): id, name, price_bs, color, active. Members buy these at checkout.",
    parameters: obj({}),
  },

  {
    name: "upsert_priority_level",
    description:
      "Create or update one of your priority tiers. tier must be low, mid, or high (one row per tier). color is a hex like #FF4D6D. price_bs is the B$ members pay for that tier.",
    parameters: obj({
      tier: {
        type: "string",
        enum: ["low", "mid", "high"],
      },
      name: { type: "string" },
      price_bs: { type: "integer" },
      color: { type: "string" },
      is_active: { type: "boolean" },
    }),
  },

  {
    name: "delete_priority_level",
    description:
      "Delete one priority tier by id, or pass delete_all true to remove every priority level you own. List first if you need ids.",
    parameters: obj({
      priority_id: nul("string"),
      delete_all: nul("boolean"),
    }),
  },

  {
    name: "read_order_chat",
    description:
      "Read the full customer chat thread on one of your assigned orders. Use before replying so you know context.",
    parameters: obj({
      order_id: { type: "string" },
    }),
  },

  {
    name: "send_order_message",
    description:
      "DISABLED. Order chat was removed. Tell the chef to use Discord.",
    parameters: obj({
      order_id: { type: "string" },
      body: { type: "string" },
    }),
  },
];

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}


/**
 * Reject names that are instructions, UI chrome, or OCR garbage —
 * the #1 reason Skippe was adding "nonsense" from fridge pictures.
 * Real Bloxburg foods are short dish labels (Pancakes, Boba Tea, Taco…).
 */
function isBogusMenuName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) return true;

  // Pure numbers / qty-looking strings
  if (/^[\d×x\s.\-–]+$/.test(n)) return true;
  if (/^\d+\s*(x|×)?\s*\d*$/.test(n)) return true;

  // Explicit instruction / chat phrases the model used to copy as item names
  if (
    /these menu items|menu items in the picture|items in the picture|add these|add those|from the picture|in the picture|in the photo|in the image|scan this|look at|every row|every food|from every|please add|can you add|i want to add|add all|import these|rebuild|replace my menu/.test(
      n,
    )
  ) {
    return true;
  }

  // Imperative starts
  if (/^(add|create|remove|delete|update|scan|import|list|show|set|make|put|please)\b/.test(n)) {
    return true;
  }

  // Instruction + media words together
  if (
    /\b(picture|photo|image|screenshot|frame|frames|video)\b/.test(n) &&
    /\b(item|items|menu|these|those|add|create|scan|from|in)\b/.test(n)
  ) {
    return true;
  }

  // Bloxburg Content / fridge UI chrome that OCR loves to pick up
  const uiChrome = new Set([
    "content",
    "view content",
    "take",
    "take all",
    "qty",
    "quantity",
    "stock",
    "food",
    "foods",
    "item",
    "items",
    "menu",
    "menu item",
    "menu items",
    "fridge",
    "inventory",
    "panel",
    "button",
    "row",
    "rows",
    "list",
    "name",
    "amount",
    "count",
    "bloxburg",
    "roblox",
    "skippe",
    "panda",
    "panda bites",
    "close",
    "back",
    "ok",
    "yes",
    "no",
    "none",
    "null",
    "undefined",
    "n/a",
    "na",
    "unknown",
    "unreadable",
    "illegible",
    "blurry",
  ]);
  if (uiChrome.has(n)) return true;

  // Single filler words / pronouns that are never dish names
  if (
    /^(the|a|an|this|that|these|those|my|your|all|every|some|any|here|there|and|or|of|to|for|from|with|in|on|at)$/.test(
      n,
    )
  ) {
    return true;
  }

  // Long instruction-y sentences (real foods are short labels)
  if (n.split(" ").length > 6) return true;

  // Looks like a full sentence (contains common verbs + articles)
  if (
    /\b(is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|should|could|can|may|might)\b/.test(
      n,
    ) &&
    n.split(" ").length >= 3
  ) {
    return true;
  }

  return false;
}

async function ownItem(ctx: SkippeContext, id: string) {
  const key = `ownItem:${id}`;
  const hit = cacheGet<ReturnType<typeof ownItem> extends Promise<infer R> ? R : never>(ctx, key);
  if (hit !== undefined) return hit;

  const { data } = await ctx.supabase.from("menu_items").select("id,name,owner_id").eq("id", id).maybeSingle();

  const row = (data ?? null) as {
    id: string;
    name: string;
    owner_id: string | null;
  } | null;
  return cacheSet(ctx, key, row);
}

async function ownFulfillment(ctx: SkippeContext, orderId: string) {
  const key = `ownFulfillment:${orderId}`;
  const hit = cacheGet<{
    id: string;
    order_id: string;
    chef_id: string;
    status: string;
  } | null>(ctx, key);
  if (hit !== undefined) return hit;

  const { data } = await ctx.supabase
    .from("order_fulfillments")
    .select("id,order_id,chef_id,status")
    .eq("order_id", orderId)
    .eq("chef_id", ctx.userId)
    .maybeSingle();

  const row = (data ?? null) as {
    id: string;
    order_id: string;
    chef_id: string;
    status: string;
  } | null;
  return cacheSet(ctx, key, row);
}

/** Short-lived cache so one Skippe turn does not re-hit staff_profiles. */
const eligibleBulkCache = new Map<string, { value: boolean; until: number }>();

async function isEligibleBulkChef(ctx: SkippeContext): Promise<boolean> {
  /*
   * Admins / house kitchen are always eligible.
   *
   * Non-admins are checked against staff_profiles.username,
   * then isPublicBulkChef() determines whether that chef is
   * a configured public Bulk / Fast Service chef.
   */
  if (ctx.isAdmin) return true;

  const now = Date.now();
  const hit = eligibleBulkCache.get(ctx.userId);
  if (hit && hit.until > now) return hit.value;

  const { data } = await ctx.supabase
    .from("staff_profiles")
    .select("username")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const value = isPublicBulkChef({
    username: (data as { username?: string | null } | null)?.username ?? null,
    is_admin: false,
  });

  eligibleBulkCache.set(ctx.userId, { value, until: now + 5 * 60_000 });
  return value;
}

export async function runSkippeTool(
  ctx: SkippeContext,
  name: string,
  rawArgs: Record<string, unknown>,
  staffName: string,
): Promise<{
  result: unknown;
  run: SkippeToolRun;
}> {
  const fail = (summary: string) => ({
    result: {
      ok: false,
      error: summary,
    },
    run: {
      name,
      ok: false,
      summary,
    } satisfies SkippeToolRun,
  });

  const done = (summary: string, result: unknown, detail?: string) => ({
    result,
    run: {
      name,
      ok: true,
      summary,
      detail,
    } satisfies SkippeToolRun,
  });

  const log = (action: string, targetType: string, targetId: string | null, payload: Record<string, unknown>) =>
    logPandaAction({
      actorUserId: ctx.userId,
      actorEmail: ctx.actorEmail,
      action,
      targetType,
      targetId: targetId ?? undefined,
      payload,
    });

  switch (name) {
    case "list_menu_items": {
      const cacheKey = `list_menu_items:${ctx.userId}`;
      const cached = cacheGet<{ items: unknown[] }>(ctx, cacheKey);
      if (cached) {
        return done(`Read ${cached.items.length} of your items (cached)`, cached);
      }

      const { data, error } = await ctx.supabase
        .from("menu_items")
        .select("id,name,price_bs,stock,category,is_active")
        .eq("owner_id", ctx.userId)
        .order("name");

      if (error) return fail(error.message);

      const payload = { items: data ?? [] };
      cacheSet(ctx, cacheKey, payload);
      return done(`Read ${(data ?? []).length} of your items`, payload);
    }

    case "create_menu_item": {
      // Skippe is never allowed to set prices. Always create at B$0.
      // Chef prices the item in the staff UI; customers see "Price coming soon".
      const payload = {
        name: String(rawArgs.name ?? "")
          .trim()
          .slice(0, 100),

        description: String(rawArgs.description ?? "").slice(0, 500),

        price_bs: 0,

        stock: clampInt(rawArgs.stock, 0, 1_000_000, 0),

        category: rawArgs.category === "seasonal" ? "seasonal" : "non_seasonal",

        is_active: rawArgs.is_active !== false,

        owner_id: ctx.userId,
      };

      if (!payload.name) {
        return fail("A name is required");
      }
      if (isBogusMenuName(payload.name)) {
        return fail(
          `Refused name "${payload.name}" — that is the chef's instruction, not a food from the image. Read dish names from the picture.`,
        );
      }

      const { data, error } = await ctx.supabase.from("menu_items").insert(payload).select("id").single();

      if (error) return fail(error.message);

      const id = (data as { id: string }).id;

      await log("skippe_create_menu_item", "menu_item", id, payload);
      ctx._cache?.delete(`list_menu_items:${ctx.userId}`);

      return done(
        `Added ${payload.name}`,
        {
          ok: true,
          item_id: id,
        },
        `Price B$0 (you set the price in the staff menu) · stock ${payload.stock}`,
      );
    }

    case "update_menu_item": {
      const id = String(rawArgs.item_id ?? "");

      const item = await ownItem(ctx, id);

      if (!item) {
        return fail("Item not found");
      }

      if (item.owner_id !== ctx.userId) {
        return fail("That item belongs to another chef — you can only edit your own");
      }

      const patch: Record<string, unknown> = {};

      if (typeof rawArgs.name === "string" && rawArgs.name.trim()) {
        patch.name = rawArgs.name.trim().slice(0, 100);
      }

      if (typeof rawArgs.description === "string") {
        patch.description = rawArgs.description.slice(0, 500);
      }

      // Intentionally ignore any price_bs — Skippe cannot change prices.

      if (rawArgs.stock !== null && rawArgs.stock !== undefined) {
        patch.stock = clampInt(rawArgs.stock, 0, 1_000_000, 0);
      }

      if (rawArgs.category === "seasonal" || rawArgs.category === "non_seasonal") {
        patch.category = rawArgs.category;
      }

      if (typeof rawArgs.is_active === "boolean") {
        patch.is_active = rawArgs.is_active;
      }

      if (Object.keys(patch).length === 0) {
        return fail("Nothing to change (and prices cannot be edited by Skippe — set them in the staff menu)");
      }

      const { error } = await ctx.supabase.from("menu_items").update(patch).eq("id", id);

      if (error) return fail(error.message);

      await log("skippe_update_menu_item", "menu_item", id, patch);
      ctx._cache?.delete(`list_menu_items:${ctx.userId}`);
      ctx._cache?.delete(`ownItem:${id}`);

      return done(
        `Updated ${item.name}`,
        {
          ok: true,
        },
        Object.keys(patch).join(", "),
      );
    }

    case "delete_menu_item": {
      const id = String(rawArgs.item_id ?? "");

      const item = await ownItem(ctx, id);

      if (!item) {
        return fail("Item not found");
      }

      if (item.owner_id !== ctx.userId && !ctx.isAdmin) {
        return fail("You can only delete your own items");
      }

      const { error } = await ctx.supabase.from("menu_items").delete().eq("id", id);

      if (error) return fail(error.message);

      await log("skippe_delete_menu_item", "menu_item", id, {
        name: item.name,
      });
      ctx._cache?.delete(`list_menu_items:${ctx.userId}`);
      ctx._cache?.delete(`ownItem:${id}`);

      return done(`Deleted ${item.name}`, {
        ok: true,
      });
    }

    case "delete_all_my_menu_items": {
      const { data: mine, error: listErr } = await ctx.supabase
        .from("menu_items")
        .select("id,name")
        .eq("owner_id", ctx.userId);

      if (listErr) return fail(listErr.message);

      const rows = (mine ?? []) as Array<{ id: string; name: string }>;
      if (rows.length === 0) {
        ctx._cache?.delete(`list_menu_items:${ctx.userId}`);
        return done("No menu items to delete (your menu was already empty)", {
          ok: true,
          deleted: 0,
        });
      }

      const ids = rows.map((r) => r.id);
      const { error } = await ctx.supabase.from("menu_items").delete().in("id", ids);
      if (error) return fail(error.message);

      await log("skippe_delete_all_my_menu_items", "menu_item", ctx.userId, {
        count: ids.length,
      });
      ctx._cache?.delete(`list_menu_items:${ctx.userId}`);

      return done(`Deleted all ${ids.length} of your menu items`, {
        ok: true,
        deleted: ids.length,
      });
    }

    case "create_menu_items_batch": {
      const rawItems = Array.isArray(rawArgs.items) ? rawArgs.items : [];
      if (rawItems.length === 0) {
        return fail("Pass items: [{ name, stock, category, is_active }, ...]");
      }

      const rows: Array<Record<string, unknown>> = [];
      const skipped: string[] = [];
      for (const it of rawItems.slice(0, 80)) {
        const rec = (it ?? {}) as Record<string, unknown>;
        const name = String(rec.name ?? "")
          .trim()
          .slice(0, 100);
        if (!name) continue;
        if (isBogusMenuName(name)) {
          skipped.push(name);
          continue;
        }
        rows.push({
          name,
          description: "",
          price_bs: 0,
          stock: clampInt(rec.stock, 0, 1_000_000, 0),
          category: rec.category === "seasonal" ? "seasonal" : "non_seasonal",
          is_active: rec.is_active !== false,
          owner_id: ctx.userId,
        });
      }

      if (rows.length === 0) {
        return fail(
          skipped.length
            ? `No valid food names — refused instruction-like names (${skipped.slice(0, 3).join(", ")}). Read dish names from the image(s).`
            : "No valid item names in the batch",
        );
      }

      const { data, error } = await ctx.supabase
        .from("menu_items")
        .insert(rows)
        .select("id,name");

      if (error) return fail(error.message);

      const created = (data ?? []) as Array<{ id: string; name: string }>;
      await log("skippe_create_menu_items_batch", "menu_item", ctx.userId, {
        count: created.length,
        names: created.map((c) => c.name).slice(0, 40),
      });
      ctx._cache?.delete(`list_menu_items:${ctx.userId}`);

      const preview = created
        .slice(0, 12)
        .map((c) => c.name)
        .join(", ");
      const more = created.length > 12 ? ` (+${created.length - 12} more)` : "";

      return done(
        `Added ${created.length} items: ${preview}${more}`,
        {
          ok: true,
          count: created.length,
          item_ids: created.map((c) => c.id),
        },
        "All at B$0 — set prices in staff menu",
      );
    }

    case "get_bulk_service_fee": {
      if (!(await isEligibleBulkChef(ctx))) {
        return fail(
          "Bulk / Fast Service fee settings are only available to Bulk / Fast Service chefs and the house/admin kitchen.",
        );
      }

      const { data, error } = await ctx.supabase
        .from("bulk_service_fees")
        .select("fee_type,fee_value,fee_message,updated_at")
        .eq("chef_id", ctx.userId)
        .maybeSingle();

      if (error) return fail(error.message);

      const row = data as {
        fee_type: "percentage" | "fixed";
        fee_value: number;
        fee_message?: string | null;
        updated_at: string;
      } | null;

      if (!row || row.fee_value <= 0) {
        return done("No Bulk / Fast Service fee is currently set", {
          ok: true,
          fee_type: null,
          fee_value: 0,
          fee_message: null,
          active: false,
        });
      }

      const label = row.fee_type === "percentage" ? `${row.fee_value}%` : `B$${row.fee_value.toLocaleString()}`;
      const msg = (row.fee_message ?? "").trim();

      return done(
        `Your Bulk / Fast Service fee is ${label}${msg ? ` — message: “${msg.slice(0, 80)}”` : ""}`,
        {
          ok: true,
          fee_type: row.fee_type,
          fee_value: row.fee_value,
          fee_message: msg || null,
          active: true,
          updated_at: row.updated_at,
        },
      );
    }

    case "set_bulk_service_fee": {
      if (!(await isEligibleBulkChef(ctx))) {
        return fail("Only Bulk / Fast Service chefs and the house/admin kitchen can set a Bulk / Fast Service fee.");
      }

      const feeType = rawArgs.fee_type === "fixed" ? "fixed" : "percentage";

      const value = clampInt(rawArgs.value, 0, feeType === "percentage" ? 100 : 100_000_000, 0);

      const feeMessage =
        rawArgs.fee_message == null
          ? undefined
          : String(rawArgs.fee_message).trim().slice(0, 500);

      const payload: Record<string, unknown> = {
        chef_id: ctx.userId,
        fee_type: feeType,
        fee_value: value,
        updated_at: new Date().toISOString(),
      };
      if (feeMessage !== undefined) {
        payload.fee_message = feeMessage || null;
      }

      const { data, error } = await ctx.supabase
        .from("bulk_service_fees")
        .upsert(payload, {
            onConflict: "chef_id",
          },
        )
        .select("fee_type,fee_value,fee_message,updated_at")
        .single();

      if (error) return fail(error.message);

      await log("skippe_set_bulk_service_fee", "bulk_service_fee", ctx.userId, {
        fee_type: feeType,
        fee_value: value,
      });

      if (value === 0) {
        return done("Bulk / Fast Service fee removed", {
          ok: true,
          fee_type: feeType,
          fee_value: 0,
          active: false,
        });
      }

      const label = feeType === "percentage" ? `${value}%` : `B$${value.toLocaleString()}`;

      return done(`Bulk / Fast Service fee set to ${label}`, {
        ok: true,
        fee_type: (
          data as {
            fee_type: "percentage" | "fixed";
          }
        ).fee_type,

        fee_value: (
          data as {
            fee_value: number;
          }
        ).fee_value,

        active: true,
      });
    }

    case "list_orders": {
      const status = typeof rawArgs.status === "string" && STATUSES.includes(rawArgs.status) ? rawArgs.status : null;

      let q = ctx.supabase
        .from("order_fulfillments")
        .select("order_id,status,total_bs,created_at")
        .eq("chef_id", ctx.userId)
        .order("created_at", {
          ascending: false,
        })
        .limit(40);

      if (status) {
        q = q.eq("status", status);
      }

      const { data, error } = await q;

      if (error) return fail(error.message);

      const rows = (data ?? []) as Array<{
        order_id: string;
        status: string;
        total_bs: number;
        created_at: string;
      }>;

      const ids = rows.map((r) => r.order_id);

      const { data: orders } = ids.length
        ? await ctx.supabase.from("orders").select("id,discord_username,note").in("id", ids)
        : { data: [] };

      const byId = new Map(
        (
          (orders ?? []) as Array<{
            id: string;
            discord_username: string;
            note: string | null;
          }>
        ).map((o) => [o.id, o]),
      );

      // Line items so fridge restock can subtract reserved quantities
      const { data: orderItems } = ids.length
        ? await ctx.supabase
            .from("order_items")
            .select("order_id,menu_item_id,name,quantity")
            .in("order_id", ids)
        : { data: [] };

      const itemsByOrder = new Map<
        string,
        Array<{ menu_item_id: string | null; name: string; quantity: number }>
      >();
      for (const it of (orderItems ?? []) as Array<{
        order_id: string;
        menu_item_id: string | null;
        name: string;
        quantity: number;
      }>) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push({
          menu_item_id: it.menu_item_id,
          name: it.name,
          quantity: it.quantity,
        });
        itemsByOrder.set(it.order_id, arr);
      }

      // Aggregate reserved qty by item name for open statuses (pending/preparing/ready)
      const reservedByName: Record<string, number> = {};
      for (const r of rows) {
        if (!["pending", "preparing", "ready"].includes(r.status)) continue;
        for (const it of itemsByOrder.get(r.order_id) ?? []) {
          const key = it.name.trim().toLowerCase();
          reservedByName[key] = (reservedByName[key] ?? 0) + (it.quantity ?? 0);
        }
      }

      return done(`Read ${rows.length} of your orders`, {
        orders: rows.map((r) => ({
          order_id: r.order_id,
          reference: r.order_id.slice(0, 8),
          customer: byId.get(r.order_id)?.discord_username ?? "",
          note: byId.get(r.order_id)?.note ?? null,
          status: r.status,
          total_bs: r.total_bs,
          created_at: r.created_at,
          items: itemsByOrder.get(r.order_id) ?? [],
          // Hint for restock math: open orders still need these items unless chef says otherwise
          reserves_stock: ["pending", "preparing", "ready"].includes(r.status),
        })),
        reserved_stock_by_item_name: reservedByName,
        restock_notes: [
          "Physical fridge count ≠ sellable stock when open orders exist.",
          "Default: sellable_stock = fridge_count - reserved_for_pending_preparing_ready.",
          "Chef may correct: some already removed 'ready' order items from fridge (do not subtract again).",
          "Chef may correct: some still keep 'ready' items in fridge (do subtract).",
        ],
      });
    }

    case "set_order_status": {
      const orderId = String(rawArgs.order_id ?? "");

      const status = typeof rawArgs.status === "string" && STATUSES.includes(rawArgs.status) ? rawArgs.status : null;

      if (!status) {
        return fail("Invalid order status");
      }

      const f = await ownFulfillment(ctx, orderId);

      if (!f) {
        return fail("That order is not assigned to you");
      }

      const { error } = await ctx.supabase
        .from("order_fulfillments")
        .update({
          status,
        })
        .eq("id", f.id);

      if (error) return fail(error.message);

      await log("skippe_set_order_status", "order_fulfillment", f.id, {
        order_id: orderId,
        status,
      });

      return done(`Order #${orderId.slice(0, 8)} is now ${status}`, {
        ok: true,
        order_id: orderId,
        status,
      });
    }

    case "get_order_details": {
      const orderId = String(rawArgs.order_id ?? "");

      const f = await ownFulfillment(ctx, orderId);

      if (!f && !ctx.isAdmin) {
        return fail("That order is not assigned to you");
      }

      const { data: order, error } = await ctx.supabase
        .from("orders")
        .select("id,discord_username,note,total_bs,status,created_at")
        .eq("id", orderId)
        .maybeSingle();

      if (error) return fail(error.message);

      if (!order) {
        return fail("Order not found");
      }

      const { data: items } = await ctx.supabase
        .from("order_items")
        .select("id,menu_item_id,name,quantity,price_bs,total_bs")
        .eq("order_id", orderId);

      return done(`Read order #${orderId.slice(0, 8)}`, {
        order,
        items: items ?? [],
      });
    }

    case "list_discounts": {
      const { data, error } = await ctx.supabase
        .from("chef_discounts")
        .select("id,name,code,discount_type,value,is_automatic,is_active,starts_at,ends_at")
        .eq("owner_id", ctx.userId)
        .order("created_at", {
          ascending: false,
        });

      if (error) return fail(error.message);

      return done(`Read ${(data ?? []).length} of your discounts`, {
        discounts: data ?? [],
      });
    }

    case "create_discount": {
      const name = String(rawArgs.name ?? "")
        .trim()
        .slice(0, 100);

      if (!name) {
        return fail("A discount name is required");
      }

      const discountType = rawArgs.discount_type === "fixed" ? "fixed" : "percentage";

      // Parse value from number or strings like "10%" / "10"
      let rawValue: unknown = rawArgs.value;
      if (typeof rawValue === "string") {
        rawValue = rawValue.replace(/%/g, "").trim();
      }
      const value = clampInt(
        rawValue,
        1,
        discountType === "percentage" ? 100 : 100_000_000,
        discountType === "percentage" ? 10 : 100,
      );

      const codeRaw =
        rawArgs.code === null || rawArgs.code === undefined
          ? ""
          : String(rawArgs.code).trim().toUpperCase().slice(0, 50);

      // Default to automatic when no code is given (most chef requests).
      let automatic = rawArgs.is_automatic === true || (rawArgs.is_automatic !== false && !codeRaw);

      const code = automatic ? null : codeRaw || null;

      if (!automatic && !code) {
        // Last resort: make it automatic instead of failing.
        automatic = true;
      }

      const payload = {
        owner_id: ctx.userId,
        name,
        code: automatic ? null : code,
        discount_type: discountType,
        value,
        is_automatic: automatic,
        is_active: rawArgs.is_active !== false,
      };

      const { data, error } = await ctx.supabase.from("chef_discounts").insert(payload).select("id").single();

      if (error) {
        const bits = [
          `create_discount failed writing public.chef_discounts`,
          `supabase: ${error.message}`,
          error.code ? `code=${error.code}` : "",
          error.details ? `details=${error.details}` : "",
          error.hint ? `hint=${error.hint}` : "",
          `where=src/lib/skippe.server.ts case "create_discount"`,
        ].filter(Boolean);
        return fail(bits.join(" | "));
      }

      const id = (data as { id: string }).id;

      await log("skippe_create_discount", "discount", id, payload);

      const kind = automatic ? "automatic (no code needed)" : `code ${payload.code}`;

      return done(
        `Created “${name}” — ${value}${discountType === "percentage" ? "%" : " B$"} off, ${kind}`,
        {
          ok: true,
          discount_id: id,
          name,
          value,
          discount_type: discountType,
          is_automatic: automatic,
          code: payload.code,
        },
        `${discountType} ${value} · ${kind}`,
      );
    }

    case "update_discount": {
      const id = String(rawArgs.discount_id ?? "");

      const { data: existing } = await ctx.supabase
        .from("chef_discounts")
        .select("id,name,owner_id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) {
        return fail("Discount not found");
      }

      if (
        (
          existing as {
            owner_id: string | null;
          }
        ).owner_id !== ctx.userId
      ) {
        return fail("You can only edit your own discounts");
      }

      const patch: Record<string, unknown> = {};

      if (typeof rawArgs.name === "string" && rawArgs.name.trim()) {
        patch.name = rawArgs.name.trim().slice(0, 100);
      }

      if (rawArgs.value !== null && rawArgs.value !== undefined) {
        patch.value = clampInt(rawArgs.value, 0, 100_000_000, 0);
      }

      if (typeof rawArgs.code === "string") {
        patch.code = rawArgs.code.trim().toUpperCase().slice(0, 50);
      }

      if (typeof rawArgs.is_automatic === "boolean") {
        patch.is_automatic = rawArgs.is_automatic;

        if (rawArgs.is_automatic) {
          patch.code = null;
        }
      }

      if (typeof rawArgs.is_active === "boolean") {
        patch.is_active = rawArgs.is_active;
      }

      if (Object.keys(patch).length === 0) {
        return fail("Nothing to change");
      }

      const { error } = await ctx.supabase.from("chef_discounts").update(patch).eq("id", id);

      if (error) return fail(error.message);

      await log("skippe_update_discount", "discount", id, patch);

      return done(
        `Updated ${
          (
            existing as {
              name: string;
            }
          ).name
        }`,
        {
          ok: true,
        },
        Object.keys(patch).join(", "),
      );
    }

    case "end_discount": {
      const id = String(rawArgs.discount_id ?? "");

      const { data: existing } = await ctx.supabase
        .from("chef_discounts")
        .select("id,name,owner_id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) {
        return fail("Discount not found");
      }

      if (
        (
          existing as {
            owner_id: string | null;
          }
        ).owner_id !== ctx.userId
      ) {
        return fail("You can only end your own discounts");
      }

      const { error } = await ctx.supabase
        .from("chef_discounts")
        .update({
          is_active: false,
          ends_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) return fail(error.message);

      await log("skippe_end_discount", "discount", id, {});

      return done(
        `Ended ${
          (
            existing as {
              name: string;
            }
          ).name
        }`,
        {
          ok: true,
        },
      );
    }

    case "list_priority_levels": {
      const { data, error } = await ctx.supabase
        .from("chef_priority_levels")
        .select("id,tier,name,price_bs,color,is_active,created_at")
        .eq("owner_id", ctx.userId)
        .order("tier");

      if (error) {
        return fail(
          `list_priority_levels failed on public.chef_priority_levels | ${error.message} | where=src/lib/skippe.server.ts case "list_priority_levels"`,
        );
      }

      const rows = (data ?? []) as Array<{
        id: string;
        tier: string;
        name: string;
        price_bs: number;
        color: string;
        is_active: boolean;
      }>;

      return done(`Read ${rows.length} of your priority levels`, {
        levels: rows,
      });
    }

    case "upsert_priority_level": {
      const tierRaw = String(rawArgs.tier ?? "").toLowerCase();
      const tier = tierRaw === "low" || tierRaw === "mid" || tierRaw === "high" ? tierRaw : null;
      if (!tier) {
        return fail("tier must be low, mid, or high");
      }

      const name = String(rawArgs.name ?? "")
        .trim()
        .slice(0, 40);
      if (!name) {
        return fail("A priority name is required");
      }

      const price_bs = clampInt(rawArgs.price_bs, 0, 100_000_000, 0);

      let color = String(rawArgs.color ?? "#FF4D6D").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        color = "#FF4D6D";
      }

      const is_active = rawArgs.is_active !== false;

      const payload = {
        owner_id: ctx.userId,
        tier,
        name,
        price_bs,
        color,
        is_active,
      };

      const { error } = await ctx.supabase
        .from("chef_priority_levels")
        .upsert(payload, { onConflict: "owner_id,tier" });

      if (error) {
        return fail(
          [
            `upsert_priority_level failed on public.chef_priority_levels`,
            `supabase: ${error.message}`,
            error.code ? `code=${error.code}` : "",
            `where=src/lib/skippe.server.ts case "upsert_priority_level"`,
          ]
            .filter(Boolean)
            .join(" | "),
        );
      }

      await log("skippe_upsert_priority_level", "chef_priority_level", null, payload);

      return done(
        `Saved ${tier} priority “${name}” at B$${price_bs}`,
        { ok: true, ...payload },
        `${tier} · ${color} · ${is_active ? "active" : "off"}`,
      );
    }

    case "delete_priority_level": {
      const deleteAll = rawArgs.delete_all === true;
      const priorityId = String(rawArgs.priority_id ?? "").trim();

      if (!deleteAll && !priorityId) {
        return fail("Pass priority_id to delete one level, or delete_all true to remove all of yours");
      }

      if (deleteAll) {
        const { data, error } = await ctx.supabase
          .from("chef_priority_levels")
          .delete()
          .eq("owner_id", ctx.userId)
          .select("id,tier,name");

        if (error) {
          return fail(
            `delete_priority_level (all) failed | ${error.message} | where=src/lib/skippe.server.ts case "delete_priority_level"`,
          );
        }

        const removed = (data ?? []) as Array<{ id: string; tier: string; name: string }>;
        await log("skippe_delete_all_priority_levels", "chef_priority_level", null, {
          count: removed.length,
        });

        return done(
          removed.length
            ? `Deleted ${removed.length} priority level(s): ${removed.map((r) => r.tier).join(", ")}`
            : "You had no priority levels to delete",
          { ok: true, deleted: removed },
        );
      }

      const { data: existing } = await ctx.supabase
        .from("chef_priority_levels")
        .select("id,tier,name,owner_id")
        .eq("id", priorityId)
        .maybeSingle();

      if (!existing) {
        return fail("Priority level not found");
      }

      if ((existing as { owner_id: string | null }).owner_id !== ctx.userId) {
        return fail("You can only delete your own priority levels");
      }

      const { error } = await ctx.supabase
        .from("chef_priority_levels")
        .delete()
        .eq("id", priorityId)
        .eq("owner_id", ctx.userId);

      if (error) {
        return fail(
          `delete_priority_level failed | ${error.message} | where=src/lib/skippe.server.ts case "delete_priority_level"`,
        );
      }

      await log("skippe_delete_priority_level", "chef_priority_level", priorityId, {
        tier: (existing as { tier: string }).tier,
      });

      return done(`Deleted ${(existing as { tier: string }).tier} priority “${(existing as { name: string }).name}”`, {
        ok: true,
      });
    }

    case "read_order_chat":
    case "send_order_message": {
      return fail("Order chat was removed. Use Discord.");
    }

    default:
      return fail(`Unknown tool ${name}`);
  }
}

/** Only tools relevant to this message — smaller payload = cheaper + fewer bad calls. */
export function selectToolsForMessage(
  userText: string,
  imageCount: number,
  history?: Array<{ role: string; content: string }>,
): ToolDef[] {
  const msg = (userText || "").toLowerCase().trim();
  const want = new Set<string>();

  // --- Vision / fridge frames (fast path) ---
  // Create tools first. No discounts. Skip list on pure "add" so the model does not stop after listing.
  if (imageCount > 0) {
    const pureAdd =
      /\b(add|create|import)\b/.test(msg) ||
      /\bmenu items?\b/.test(msg) ||
      /\b(picture|photo|image)\b/.test(msg);

    want.add("create_menu_items_batch");
    want.add("create_menu_item");
    want.add("update_menu_item");

    if (
      /\b(remove|delete|clear)\s+all\b/.test(msg) ||
      /\bdelete\s+every\b/.test(msg) ||
      /\brebuild\b/.test(msg) ||
      /\breplace\b/.test(msg)
    ) {
      want.add("delete_all_my_menu_items");
      want.add("delete_menu_item");
    }

    if (!pureAdd) {
      want.add("list_menu_items");
    }

    if (/\b(order|orders|reserved|preparing|pending|ready|deliver)\b/.test(msg)) {
      want.add("list_orders");
      want.add("set_order_status");
      want.add("get_order_details");
    }

    return SKIPPE_TOOLS.filter((t) => want.has(t.name));
  }

  // --- Short follow-ups after a fridge/menu turn ("add those", "yes", "do it") ---
  const followUpAction =
    /^(add|update|create|restock|save|do)\s+(those|them|it|that|these|all)\b/.test(msg) ||
    /^(yes|yep|yeah|ok|okay|sure|please|go ahead|do it|add them|add those|update those)\b/.test(
      msg,
    ) ||
    /\b(add|update|create|restock)\s+(those|them|these|all)\b/.test(msg);

  const recentContext = (history || [])
    .slice(-6)
    .map((h) => h.content || "")
    .join("\n")
    .toLowerCase();

  const historyAboutMenu =
    /\b(fridge|content|menu|stock|item|items|boba|hot chocolate|popcorn|cheesecake|restock)\b/.test(
      recentContext,
    ) || /\b(create_menu_item|list_menu_items|update_menu_item)\b/.test(recentContext);

  if (followUpAction && historyAboutMenu) {
    want.add("list_menu_items");
    want.add("create_menu_item");
    want.add("create_menu_items_batch");
    want.add("update_menu_item");
    return SKIPPE_TOOLS.filter((t) => want.has(t.name));
  }

  // Bare "add those" / typos ("add thosew") / "add them" — always menu tools
  if (
    /\b(add|create|update|restock)\s+thos/i.test(msg) ||
    /\b(add|create|update|restock)\s+(those|them|these|all|it|that)\b/.test(msg) ||
    /\b(add|create)\s+\w{0,6}$/.test(msg) ||
    msg === "add those" ||
    msg === "add them" ||
    msg === "update those" ||
    msg === "restock those"
  ) {
    want.add("list_menu_items");
    want.add("create_menu_item");
    want.add("create_menu_items_batch");
    want.add("update_menu_item");
    return SKIPPE_TOOLS.filter((t) => want.has(t.name));
  }

  // --- Text intents: offer ONLY matching tools (zero waste) ---
  if (/\bpriorit|\bpriort|\b(low|mid|high)\s+(tier|level|to|at)\b/.test(msg)) {
    want.add("list_priority_levels");
    want.add("upsert_priority_level");
    want.add("delete_priority_level");
  }
  if (/\bdiscount|\bpromo|\b% off\b|\boff\b.*\b(auto|code)\b/.test(msg)) {
    want.add("list_discounts");
    want.add("create_discount");
    want.add("update_discount");
    want.add("end_discount");
  }
  if (/\b(menu|item|dish|stock|restock|fridge|add|picture|photo|image|these|those)\b/.test(msg)) {
    want.add("list_menu_items");
    want.add("create_menu_item");
    want.add("create_menu_items_batch");
    want.add("update_menu_item");
    want.add("delete_menu_item");
    want.add("delete_all_my_menu_items");
  }
  if (/\b(remove|delete|clear)\s+all\b/.test(msg) || /\bdelete\s+every\b/.test(msg)) {
    want.add("list_menu_items");
    want.add("delete_all_my_menu_items");
    want.add("delete_menu_item");
    want.add("create_menu_item");
    want.add("create_menu_items_batch");
  }
  if (/\border\b|\bclaim\b|\bpreparing\b|\bdeliver/.test(msg)) {
    want.add("list_orders");
    want.add("set_order_status");
    want.add("get_order_details");
  }
  if (/\bbulk\b/.test(msg) && /\b(fee|service)\b/.test(msg)) {
    want.add("get_bulk_service_fee");
    want.add("set_bulk_service_fee");
  }

  // Unknown chat → NO tools (don't burn DB listing everything)
  if (want.size === 0) {
    return [];
  }

  return SKIPPE_TOOLS.filter((t) => want.has(t.name));
}


/** Short prompt for text-only turns (big token saver). */
export function buildSkippePromptLite(args: { staffName: string; isAdmin: boolean }) {
  return [
    `Skippe — Panda Bites kitchen AI for ${args.staffName} (${args.isAdmin ? "admin" : "chef"}). B$.`,
    "Call tools. Never narrate fake success.",
    "NEVER say Added/Created/Done unless a tool returned ok:true this turn.",
    "Prices on create are always B$0.",
    "Pictures → create_menu_items_batch with food names READ from the image, never the chat sentence as a name.",
    "Do not list_discounts or list_orders unless asked.",
    "If you cannot read the image, say so in one line — do not invent items.",
  ].join("\n");
}

export function buildSkippePrompt(args: {
  staffName: string;
  isAdmin: boolean;
  /** When true, include fridge/restock guidance (images attached). */
  withVision?: boolean;
}) {
  if (!args.withVision) {
    return buildSkippePromptLite(args);
  }

  // Vision turns — transcribe Content rows, then WRITE. Never list-and-stop.
  return [
    `Skippe — kitchen AI for ${args.staffName} (${args.isAdmin ? "admin" : "chef"}). Bloxburg food shop, currency B$.`,
    "",
    "You CAN see the attached images. Never say they are missing.",
    "",
    "YOUR ONLY JOB THIS TURN:",
    "1) Read EVERY food name (and qty number if visible) from the Bloxburg Content / fridge list in the photos.",
    "2) Call create_menu_items_batch ONCE with those foods.",
    "3) Do NOT call list_menu_items, list_discounts, or list_orders unless the chef asked to list.",
    "",
    "ITEM NAMES = text on the food rows in the picture (e.g. Pancakes, Taco, Boba Tea).",
    "FORBIDDEN names (tools reject them): the chef's sentence, 'these menu items in the picture', 'add these', 'from the photo'.",
    "",
    "If chef asked to remove/delete all first: delete_all_my_menu_items, then create_menu_items_batch.",
    "Price is always B$0. category: seasonal for holiday foods, else non_seasonal. is_active: true.",
    "If text is unreadable: one honest line. NEVER invent a fake item. NEVER claim Added without a successful create tool.",
  ].join("\n");
}



function gatewayKey() {
  const key = process.env["LOVABLE_API_KEY"];

  if (!key) {
    throw new Error("LOVABLE_API_KEY missing");
  }

  return key;
}

function gatewayError(status: number, body: string, hint?: string) {
  if (status === 429) {
    return new Error("Skippe is over capacity — try again in a minute.");
  }

  if (status === 402) {
    return new Error("AI credits exhausted. Add credits in workspace settings.");
  }

  if (status === 401) {
    return new Error(
      "Skippe auth failed (401). LOVABLE_API_KEY is missing or invalid — check Cloud → Secrets in Lovable.",
    );
  }

  if (status === 404) {
    return new Error(
      `Skippe gateway 404${hint ? ` (${hint})` : ""}. Body: ${body.slice(0, 120)}. If this persists, the deployed skippe.server.ts may still be the old Gemini path — confirm the file uses /v1/responses only.`,
    );
  }

  if (status === 520 || status === 521 || status === 522 || status === 523 || status === 524) {
    return new Error(
      `Skippe gateway upstream error (${status})${hint ? ` ${hint}` : ""}. Usually temporary — retry in a few seconds. If it keeps happening with many fridge frames, send fewer images (3–5) or a shorter video.`,
    );
  }

  return new Error(`Skippe call failed (${status})${hint ? ` ${hint}` : ""}: ${body.slice(0, 200)}`);
}

/** Retry transient gateway failures (429 / 5xx) with short backoff. */
async function gatewayFetch(
  url: string,
  init: RequestInit,
  hint: string,
  attempts = 2,
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    last = res;
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || i === attempts - 1) return res;
    try {
      await res.text();
    } catch {
      /* ignore */
    }
    // Short backoff — long waits make Skippe feel stuck
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return last!;
}

/** Reads a Server-Sent-Events body and hands every parsed event to `onEvent`. */
async function readSse(res: Response, onEvent: (event: Record<string, unknown>) => void) {
  const reader = res.body?.getReader();

  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, {
      stream: true,
    });

    const parts = buffer.split("\n\n");

    buffer = parts.pop() ?? "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5).trim();

        if (!payload || payload === "[DONE]") {
          continue;
        }

        try {
          onEvent(JSON.parse(payload) as Record<string, unknown>);
        } catch {
          /* ignore keep-alive noise */
        }
      }
    }
  }
}

type ChatHistory = Array<{
  role: "user" | "assistant";
  content: string;
}>;

type Img = {
  data_url: string;
};

/**
 * OpenAI path — tuned for speed.
 * - service_tier: priority (faster OpenAI tier)
 * - stream: false (tool loops finish faster without SSE overhead)
 * - short history + capped output
 * - max 2 tool rounds
 */
async function runOpenAiTurn(args: {
  model: string;
  instructions: string;
  history: ChatHistory;
  userText: string;
  images: Img[];
  ctx: SkippeContext;
  staffName: string;
  toolsEnabled?: boolean;
}): Promise<SkippeTurn> {
  const key = gatewayKey();
  const runs: SkippeToolRun[] = [];
  let reply = "";
  const toolsEnabled = args.toolsEnabled !== false;

  // Keep context tight — less tokens = less latency.
  const recent = args.history.slice(-10);

  const input: Array<Record<string, unknown>> = recent.map((h) => ({
    role: h.role,
    content: [
      {
        type: h.role === "assistant" ? "output_text" : "input_text",
        text: h.content.slice(0, 600),
      },
    ],
  }));

  const visionImages = args.images.filter((img) => {
    const u = (img?.data_url || "").trim();
    return (
      u.startsWith("data:image/") ||
      u.startsWith("https://") ||
      u.startsWith("http://")
    );
  });
  const userText =
    (args.userText || "").trim() ||
    (visionImages.length > 0
      ? `Please look at the ${visionImages.length} image(s) I attached and help with the kitchen task.`
      : "(empty)");

  input.push({
    role: "user",
    content: [
      {
        type: "input_text",
        text:
          visionImages.length > 0
            ? `${userText}\n\n(${visionImages.length} image${visionImages.length === 1 ? "" : "s"} attached below — use them.)`
            : userText,
      },
      ...visionImages.map((img) => ({
        type: "input_image",
        image_url: img.data_url,
        detail: "high",
      })),
    ],
  });

  // Vision may need list then create; text stays 1 round.
  const maxRounds = visionImages.length > 0 ? 3 : toolsEnabled ? 2 : 1;
  const selected = toolsEnabled
    ? selectToolsForMessage(args.userText, args.images.length, args.history)
    : [];
  const toolDefs = toolsEnabled
    ? selected.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        strict: true,
      }))
    : undefined;

  for (let round = 0; round < maxRounds; round += 1) {
    const res = await gatewayFetch(
      "https://ai.gateway.lovable.dev/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          Authorization: `Bearer ${key}`,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: args.model,
          instructions: args.instructions,
          input,
          // Non-stream is faster for tool-agent loops (UI waits for full reply anyway).
          stream: false,
          store: false,
          // Do not send service_tier — Lovable gateway may 500 on unsupported values.
          max_output_tokens: 400,
          ...(toolDefs ? { tools: toolDefs } : {}),
        }),
      },
      `model=${args.model} path=/v1/responses`,
    );

    if (!res.ok) {
      throw gatewayError(res.status, await res.text(), `model=${args.model} path=/v1/responses`);
    }

    const data = (await res.json()) as {
      output?: Array<Record<string, unknown>>;
      output_text?: string;
    };

    const output = data.output ?? [];

    if (typeof data.output_text === "string" && data.output_text) {
      reply = data.output_text;
    }

    const calls = output.filter((item) => item["type"] === "function_call");

    if (calls.length === 0) {
      if (!reply) {
        for (const item of output) {
          if (item["type"] !== "message") continue;
          for (const part of (item["content"] as Array<Record<string, unknown>>) ?? []) {
            if (part["type"] === "output_text" && typeof part["text"] === "string") {
              reply += part["text"];
            }
          }
        }
      }
      break;
    }

    input.push(...output);

    for (const call of calls.slice(0, 8)) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(String(call["arguments"] ?? "{}")) as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      const { result, run } = await runSkippeTool(args.ctx, String(call["name"]), parsedArgs, args.staffName);

      runs.push(run);

      input.push({
        type: "function_call_output",
        call_id: call["call_id"],
        output: JSON.stringify(result).slice(0, 4000),
      });
    }
  }

  if (runs.length === 0) {
    const fallback = await maybeRunIntentFallback(args.ctx, args.staffName, args.userText, args.history);
    if (fallback) {
      runs.push(...fallback.runs);
      // Always trust the fallback when the model skipped tools (it often invents "no access").
      reply = fallback.reply;
    }
  }

  if (!reply.trim()) {
    reply = synthesizeReplyFromRuns(runs);
  }

  reply = finalizeSkippeReply({
    userText: args.userText,
    imageCount: visionImages.length,
    runs,
    modelReply: reply,
  });

  return {
    reply: reply.trim(),
    thinking: "",
    runs,
    model: args.model,
  };
}

/** Build a human reply when the model forgets to write one after tools. */
function synthesizeReplyFromRuns(runs: SkippeToolRun[]): string {
  if (runs.length === 0) {
    return "I need a clearer ask — e.g. add Gingerbread Hot Chocolate stock 213, or attach a Content picture.";
  }

  const lines = runs.map((r) => {
    const mark = r.ok ? "✅" : "⚠️";
    const extra = r.detail ? ` (${r.detail})` : "";
    return `${mark} ${r.summary}${extra}`;
  });

  return lines.join("\n");
}

function askedToAddFromPicture(userText: string, imageCount: number): boolean {
  const msg = (userText || "").toLowerCase();
  if (imageCount > 0) {
    return (
      /\b(add|create|import|rebuild|replace)\b/.test(msg) ||
      /\bmenu items?\b/.test(msg) ||
      msg.length < 120
    );
  }
  return /\b(add|create|import)\b/.test(msg) && /\b(picture|photo|image|these|those)\b/.test(msg);
}

function successfulCreates(runs: SkippeToolRun[]): SkippeToolRun[] {
  return runs.filter(
    (r) =>
      r.ok &&
      (r.name === "create_menu_item" ||
        r.name === "create_menu_items_batch"),
  );
}

/** Pull food names the model transcribed in prose when it skipped the create tool. */
function extractFoodsFromModelText(text: string): Array<{
  name: string;
  stock: number;
  category: "non_seasonal" | "seasonal";
  is_active: boolean;
}> {
  const out: Array<{
    name: string;
    stock: number;
    category: "non_seasonal" | "seasonal";
    is_active: boolean;
  }> = [];
  const seen = new Set<string>();
  // Prefer line-shaped lists only — splitting on commas used to turn full
  // sentences into fake "foods".
  const lines = (text || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(
      /^(?:\d+[\.\)]\s*|[-*•]\s*)?([A-Za-z][A-Za-z0-9 .'&]{1,40}?)(?:\s+[x×]?\s*(\d{1,6}))?\s*$/,
    );
    if (!m) continue;
    const name = m[1].trim();
    if (isBogusMenuName(name)) continue;
    if (name.split(" ").length > 5) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      stock: m[2] ? clampInt(m[2], 0, 1_000_000, 0) : 0,
      category: /holiday|christmas|halloween|valentine|season/i.test(name)
        ? "seasonal"
        : "non_seasonal",
      is_active: true,
    });
  }
  return out.slice(0, 80);
}

/** Never allow chat to claim Added when no create tool returned ok:true. */
function finalizeSkippeReply(args: {
  userText: string;
  imageCount: number;
  runs: SkippeToolRun[];
  modelReply: string;
}): string {
  const { userText, imageCount, runs, modelReply } = args;
  const creates = successfulCreates(runs);
  const askedAdd = askedToAddFromPicture(userText, imageCount);
  const modelClaimedAdd =
    /\b(added|created|imported|all set|i'?ve added|successfully added)\b/i.test(
      modelReply || "",
    );

  if (creates.length > 0) {
    return synthesizeReplyFromRuns(runs);
  }

  if (askedAdd && creates.length === 0) {
    return imageCount > 0
      ? "I did **not** add menu items this turn (no successful create tool ran). I got your picture(s) but could not map food names into create_menu_items_batch. Send a sharper Content close-up, or type: `add Pancakes stock 12, Taco stock 5`."
      : "I did **not** add menu items this turn (no successful create tool ran). Re-attach the picture or type the food names.";
  }

  if (modelClaimedAdd) {
    return runs.length > 0
      ? synthesizeReplyFromRuns(runs)
      : "Nothing was added — no create tool succeeded.";
  }

  const cleaned = (modelReply || "").trim();
  return cleaned || synthesizeReplyFromRuns(runs);
}

/**
 * Google / non-OpenAI path via OpenAI-compatible /v1/chat/completions.
 * Lovable: /v1/responses is OpenAI-only; other chat models must use chat/completions.
 */
async function runGoogleTurn(args: {
  model: string;
  instructions: string;
  history: ChatHistory;
  userText: string;
  images: Img[];
  ctx: SkippeContext;
  staffName: string;
  toolsEnabled?: boolean;
}): Promise<SkippeTurn> {
  const key = gatewayKey();
  const runs: SkippeToolRun[] = [];
  let reply = "";

  type ChatMsg = {
    role: string;
    content: string | Array<Record<string, unknown>>;
    tool_calls?: Array<Record<string, unknown>>;
    tool_call_id?: string;
    name?: string;
  };

  const messages: ChatMsg[] = [
    {
      role: "system",
      content: args.instructions,
    },
    ...args.history.slice(-10).map((h) => ({
      role: h.role,
      content: h.content.slice(0, 2000),
    })),
  ];

  // Only keep real data: / https image URLs — drop blanks that make Gemini claim "no images"
  const visionImages = args.images.filter((img) => {
    const u = (img?.data_url || "").trim();
    return (
      u.startsWith("data:image/") ||
      u.startsWith("https://") ||
      u.startsWith("http://")
    );
  });

  const userText =
    (args.userText || "").trim() ||
    (visionImages.length > 0
      ? `Please look at the ${visionImages.length} image(s) I attached and help with the kitchen task.`
      : "(empty)");

  const askedAdd = askedToAddFromPicture(userText, visionImages.length);

  const userContent: Array<Record<string, unknown>> = [];

  // Images first — models attend better; include detail:high when the gateway honors it
  for (const image of visionImages) {
    userContent.push({
      type: "image_url",
      image_url: { url: image.data_url, detail: "high" },
    });
  }

  const visionTask =
    visionImages.length > 0
      ? [
          userText,
          "",
          `You have ${visionImages.length} image(s) attached ABOVE.`,
          askedAdd
            ? "TASK: Transcribe every food name (+ stock qty if shown) from the pictures, then call create_menu_items_batch NOW. Do not list the menu. Do not use this sentence as an item name."
            : "Look at the pictures and use kitchen tools to finish the ask.",
        ].join("\n")
      : userText;

  userContent.push({
    type: "text",
    text: visionTask,
  });

  messages.push({
    role: "user",
    content: visionImages.length > 0 ? userContent : userText,
  });

  const toolsEnabled = args.toolsEnabled !== false;
  const selected = toolsEnabled
    ? selectToolsForMessage(args.userText, visionImages.length, args.history)
    : [];
  const tools = toolsEnabled
    ? selected.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    : undefined;

  // 1 round is enough for parallel tool_calls. 2 only if create/update is available
  // (list then write). Never spin on repeated list_orders.
  let maxRounds =
    toolsEnabled &&
    selected.some((t) =>
      [
        "create_menu_item",
        "create_menu_items_batch",
        "delete_all_my_menu_items",
        "update_menu_item",
        "create_discount",
        "upsert_priority_level",
        "set_order_status",
      ].includes(t.name),
    )
      ? 3
      : 1;

  for (let round = 0; round < maxRounds; round += 1) {
    const stillNeedCreate = askedAdd && successfulCreates(runs).length === 0;
    const forceBatch =
      stillNeedCreate &&
      selected.some((t) => t.name === "create_menu_items_batch");

    const res = await gatewayFetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          Authorization: `Bearer ${key}`,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: args.model,
          messages,
          ...(tools ? { tools } : {}),
          ...(tools && tools.length > 0
            ? {
                tool_choice: forceBatch
                  ? {
                      type: "function",
                      function: { name: "create_menu_items_batch" },
                    }
                  : "required",
              }
            : {}),
          stream: false,
          temperature: 0,
          max_tokens: visionImages.length > 0 ? 1400 : 600,
        }),
      },
      `model=${args.model} path=/v1/chat/completions`,
    );

    if (!res.ok) {
      throw gatewayError(res.status, await res.text(), `model=${args.model} path=/v1/chat/completions`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
      }>;
    };

    const message = data.choices?.[0]?.message;
    if (!message) {
      break;
    }

    if (typeof message.content === "string" && message.content) {
      reply = message.content;
    }

    const toolCalls = toolsEnabled ? (message.tool_calls ?? []) : [];
    if (toolCalls.length === 0) {
      if (askedAdd && successfulCreates(runs).length === 0 && round < maxRounds - 1) {
        messages.push({
          role: "assistant",
          content: message.content ?? "",
        });
        messages.push({
          role: "user",
          content:
            "You did not call create_menu_items_batch. Look at the attached images again. Call create_menu_items_batch now with every food name you can read. Do not reply in text. Do not use my instruction as an item name.",
        });
        continue;
      }
      break;
    }

    messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type ?? "function",
        function: {
          name: tc.function?.name,
          arguments: tc.function?.arguments ?? "{}",
        },
      })),
    });

    const seenListTools = new Set<string>();
    for (const tc of toolCalls.slice(0, 24)) {
      const toolName = String(tc.function?.name ?? "");
      // Block repeated pure-read tools in the same turn (wastes DB + tokens)
      if (
        toolName.startsWith("list_") ||
        toolName.startsWith("get_")
      ) {
        if (seenListTools.has(toolName)) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id ?? "",
            name: toolName,
            content: JSON.stringify({
              ok: true,
              note: "Already fetched this turn — reuse prior result.",
            }),
          });
          continue;
        }
        seenListTools.add(toolName);
      }

      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments ?? "{}") as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      const { result, run } = await runSkippeTool(
        args.ctx,
        toolName,
        parsedArgs,
        args.staffName,
      );

      runs.push(run);

      messages.push({
        role: "tool",
        tool_call_id: tc.id ?? "",
        name: toolName,
        content: JSON.stringify(result),
      });
    }

    if (askedAdd && successfulCreates(runs).length === 0 && round < maxRounds - 1) {
      messages.push({
        role: "user",
        content:
          "Create did not succeed yet. Transcribe food names FROM THE PICTURES and call create_menu_items_batch. Forbidden: naming an item after the chef's sentence.",
      });
    }
  }

  // If the model transcribed foods in chat but never created them, do it here.
  if (askedAdd && successfulCreates(runs).length === 0) {
    const parsedFoods = extractFoodsFromModelText(reply);
    if (parsedFoods.length >= 2) {
      const { run } = await runSkippeTool(
        args.ctx,
        "create_menu_items_batch",
        { items: parsedFoods },
        args.staffName,
      );
      runs.push(run);
      if (run.ok) reply = run.summary;
    }
  }

  // Lite models sometimes invent "I couldn't create that" without calling tools.
  // If the chef clearly asked for a kitchen action and zero tools ran, do it here.
  // Skipped entirely when toolsEnabled is false (pure vision = zero kitchen DB).
  if (toolsEnabled && runs.length === 0) {
    const fallback = await maybeRunIntentFallback(args.ctx, args.staffName, args.userText, args.history);
    if (fallback) {
      runs.push(...fallback.runs);
      // Always trust the fallback when the model skipped tools (it often invents "no access").
      reply = fallback.reply;
    }
  }

  if (!reply.trim()) {
    reply = synthesizeReplyFromRuns(runs);
  }

  reply = finalizeSkippeReply({
    userText: args.userText,
    imageCount: visionImages.length,
    runs,
    modelReply: reply,
  });

  const deniedVision =
    visionImages.length > 0 &&
    /can'?t see any images?|no images? attached|don'?t see any images?|please upload them/i.test(
      reply,
    );
  if (deniedVision) {
    reply =
      `I received ${visionImages.length} image(s) this turn but still could not finish adds. ` +
      `Send a closer Content-list shot or type the food names.`;
  }

  return {
    reply: reply.trim(),
    thinking: "",
    runs,
    model: args.model,
  };
}

/**
 * When the model skips tools, still execute clear kitchen intents.
 * Handles fuzzy messages like: "Name would be test and it would be auto"
 */
async function maybeRunIntentFallback(
  ctx: SkippeContext,
  staffName: string,
  userText: string,
  history: ChatHistory,
): Promise<{ runs: SkippeToolRun[]; reply: string } | null> {
  const msg = userText.toLowerCase();

  // PRIORITY — parse & execute without waiting on the LLM.
  // Do NOT use chat history (old discount turns used to misfire).
  const mentionsPriority =
    /\bpriorit/i.test(msg) ||
    /\bpriort/i.test(msg) ||
    /\b(low|mid|high)\s+(tier|level)\b/i.test(msg) ||
    /\b(set|update|change|save)\s+(the\s+)?(low|mid|high)\b/i.test(msg) ||
    /\b(low|mid|high)\s+(to|at|for|=)\s*b?\$?\s*[\d,]+/i.test(msg);

  if (mentionsPriority) {
    if (/\b(delete|remove|clear)\b/i.test(msg) && /\b(all|every)\b/i.test(msg)) {
      const { run } = await runSkippeTool(
        ctx,
        "delete_priority_level",
        { priority_id: null, delete_all: true },
        staffName,
      );
      return {
        runs: [run],
        reply: run.ok ? `✅ ${run.summary}` : `⚠️ ${run.summary}`,
      };
    }

    const wantsList =
      /\b(list|show|see|what|current|my tiers?|my levels?)\b/i.test(msg) &&
      !/\b(set|update|change|make|save)\b/i.test(msg);

    if (wantsList) {
      const { run } = await runSkippeTool(ctx, "list_priority_levels", {}, staffName);
      return {
        runs: [run],
        reply: run.ok
          ? `✅ ${run.summary}\nSay e.g. **set mid to B$5000 color blue** to change a tier.`
          : `⚠️ ${run.summary}`,
      };
    }

    // set / update / change low|mid|high …
    const tierMatch = msg.match(/\b(low|mid|high)\b/i);
    const priceMatch =
      userText.match(/b\$\s*([\d,]+)/i) ||
      userText.match(/\$\s*([\d,]+)/) ||
      userText.match(
        /\b(?:to|at|for|price|cost|is|=)\s*([\d,]+)\b/i,
      ) ||
      userText.match(/\b([\d,]{2,})\b/);
    const colorWord = msg.match(
      /\b(red|blue|green|gold|yellow|purple|pink|orange|black|white|cherry|lime)\b/i,
    );
    const hexColor = userText.match(/#([0-9a-fA-F]{6})\b/);
    const nameMatch =
      userText.match(
        /\b(?:name[d]?|call(?:ed)?)\s+[\"']?([a-z0-9][a-z0-9 \-]{0,30})[\"']?/i,
      ) ||
      userText.match(/[\"']([^\"']{1,40})[\"']/);

    const COLOR_MAP: Record<string, string> = {
      red: "#FF4D6D",
      cherry: "#FF4D6D",
      blue: "#3B82F6",
      green: "#22C55E",
      lime: "#84CC16",
      gold: "#EAB308",
      yellow: "#EAB308",
      purple: "#A855F7",
      pink: "#EC4899",
      orange: "#F97316",
      black: "#111111",
      white: "#F8FAFC",
    };

    if (tierMatch && priceMatch) {
      const tier = tierMatch[1].toLowerCase() as "low" | "mid" | "high";
      const price_bs = Math.max(
        0,
        parseInt(priceMatch[1].replace(/,/g, ""), 10) || 0,
      );
      const defaultNames = { low: "Low", mid: "Mid", high: "High" };
      const name = (nameMatch?.[1]?.trim() || defaultNames[tier]).slice(0, 40);
      let color = "#FF4D6D";
      if (hexColor) color = `#${hexColor[1]}`;
      else if (colorWord) {
        color = COLOR_MAP[colorWord[1].toLowerCase()] ?? color;
      }

      const { run } = await runSkippeTool(
        ctx,
        "upsert_priority_level",
        {
          tier,
          name,
          price_bs,
          color,
          is_active: !/\b(off|inactive|disable)\b/i.test(msg),
        },
        staffName,
      );
      return {
        runs: [run],
        reply: run.ok
          ? `✅ ${run.summary}${run.detail ? ` · ${run.detail}` : ""}`
          : `⚠️ ${run.summary}`,
      };
    }

    return {
      runs: [],
      reply:
        "Priority — try:\n• **list my priority**\n• **set mid to B$5000 color blue**\n• **set high named Express at 10000**\n• **delete all priority**",
    };
  }

  // ── RESTORE deleted items from the same message ───────────────────
  // e.g. "✅ Deleted Latte\n…\nAdd them all back"
  if (/\b(add|restore|put)\b/i.test(msg) && /\b(back|them|those|these|all)\b/i.test(msg)) {
    const deletedNames: string[] = [];
    const delRe = /(?:✅\s*)?Deleted\s+([^\n✅]+)/gi;
    let dm: RegExpExecArray | null;
    while ((dm = delRe.exec(userText)) !== null) {
      const n = dm[1].replace(/\s+/g, " ").trim();
      if (n.length >= 2 && n.toLowerCase() !== "s") deletedNames.push(n);
    }
    // Also pull names from recent history lines that look like deletes / fridge rows
    if (deletedNames.length === 0) {
      const hist = history
        .slice(-8)
        .map((h) => h.content)
        .join("\n");
      let hm: RegExpExecArray | null;
      const hr = /(?:✅\s*)?Deleted\s+([^\n✅]+)/gi;
      while ((hm = hr.exec(hist)) !== null) {
        const n = hm[1].replace(/\s+/g, " ").trim();
        if (n.length >= 2 && n.toLowerCase() !== "s") deletedNames.push(n);
      }
    }
    // Dedupe
    const unique = [...new Set(deletedNames.map((n) => n.trim()))].slice(0, 20);
    if (unique.length > 0) {
      const runs: SkippeToolRun[] = [];
      const lines: string[] = [];
      for (const name of unique) {
        const { run } = await runSkippeTool(
          ctx,
          "create_menu_item",
          {
            name,
            description: "",
            stock: 0,
            category: "non_seasonal",
            is_active: true,
          },
          staffName,
        );
        runs.push(run);
        lines.push(run.ok ? `✅ ${run.summary}` : `⚠️ ${run.summary}`);
      }
      return { runs, reply: lines.join("\n") };
    }
  }

    // ── MENU (instant, no LLM) ──────────────────────────────────────────
  const wantsMenuList =
    /\b(list|show|see)\b/i.test(msg) &&
    /\b(menu|items?|dishes|stock)\b/i.test(msg);

  if (wantsMenuList) {
    const { run } = await runSkippeTool(ctx, "list_menu_items", {}, staffName);
    return {
      runs: [run],
      reply: run.ok ? `✅ ${run.summary}` : `⚠️ ${run.summary}`,
    };
  }

  // "add item lobster stock 20" / "create menu item pizza with stock 5"
  const addMenu =
    /\b(add|create|make|new)\b/i.test(msg) &&
    /\b(item|dish|food|menu)\b/i.test(msg);
  if (addMenu) {
    const nameMatch =
      userText.match(
        /\b(?:item|dish|food|named?|called)\s+[\"']?([a-z0-9][a-z0-9 \-']{0,40})[\"']?/i,
      ) ||
      userText.match(/\badd\s+[\"']?([a-z0-9][a-z0-9 \-']{0,40})[\"']?/i);
    let name = nameMatch?.[1]?.trim() ?? "";
    // strip trailing "stock …"
    name = name.replace(/\s+stock\b.*$/i, "").trim();
    const stockMatch = userText.match(/\bstock\s*[:=]?\s*(\d{1,7})\b/i);
    const stock = stockMatch ? parseInt(stockMatch[1], 10) : 0;
    const seasonal = /\bseasonal\b/i.test(msg);
    if (name && name.length >= 2) {
      const { run } = await runSkippeTool(
        ctx,
        "create_menu_item",
        {
          name,
          description: "",
          stock,
          category: seasonal ? "seasonal" : "non_seasonal",
          is_active: true,
        },
        staffName,
      );
      return {
        runs: [run],
        reply: run.ok
          ? `✅ ${run.summary}${run.detail ? ` · ${run.detail}` : ""}`
          : `⚠️ ${run.summary}`,
      };
    }
  }

  // "set stock of lobster to 40" / "update pizza stock 12"
  const stockUpdate =
    /\bstock\b/i.test(msg) &&
    /\b(set|update|change|make)\b/i.test(msg);
  if (stockUpdate) {
    const stockMatch = userText.match(/\bstock\s*(?:of\s+)?(?:to\s+)?[:=]?\s*(\d{1,7})\b/i) ||
      userText.match(/\bto\s+(\d{1,7})\b/i);
    const stock = stockMatch ? parseInt(stockMatch[1], 10) : NaN;
    const nameMatch =
      userText.match(
        /\b(?:stock\s+(?:of\s+)?|update\s+|set\s+)[\"']?([a-z][a-z0-9 \-']{1,40}?)[\"']?\s+(?:stock|to)\b/i,
      ) ||
      userText.match(/\b(?:of|for)\s+[\"']?([a-z][a-z0-9 \-']{1,40})[\"']?/i);
    const itemName = nameMatch?.[1]?.trim().toLowerCase();
    if (itemName && Number.isFinite(stock)) {
      const { result, run: listRun } = await runSkippeTool(
        ctx,
        "list_menu_items",
        {},
        staffName,
      );
      const items =
        (result as { items?: Array<{ id: string; name: string }> })?.items ??
        [];
      const hit = items.find(
        (i) => i.name.toLowerCase() === itemName ||
          i.name.toLowerCase().includes(itemName),
      );
      if (!hit) {
        return {
          runs: [listRun],
          reply: listRun.ok
            ? `⚠️ No menu item matching “${itemName}”. Say **list my menu** to see names.`
            : `⚠️ ${listRun.summary}`,
        };
      }
      const { run } = await runSkippeTool(
        ctx,
        "update_menu_item",
        { item_id: hit.id, stock },
        staffName,
      );
      return {
        runs: [listRun, run],
        reply: run.ok
          ? `✅ ${run.summary} → stock ${stock}`
          : `⚠️ ${run.summary}`,
      };
    }
  }

  // orders list
  if (/\b(list|show)\b/i.test(msg) && /\borders?\b/i.test(msg)) {
    const { run } = await runSkippeTool(
      ctx,
      "list_orders",
      { status: null },
      staffName,
    );
    return {
      runs: [run],
      reply: run.ok ? `✅ ${run.summary}` : `⚠️ ${run.summary}`,
    };
  }


  // DISCOUNT only when THIS message is about discounts (not history).
  const wantsDiscount =
    /\bdiscount\b/i.test(msg) ||
    (/\b(auto|automatic)\b/i.test(msg) && /\b(name|off|%|percent)\b/i.test(msg));

  if (wantsDiscount) {
  // Name: "name would be test", "named weekend", "name: test", "call it test"
  const nameMatch =
    userText.match(/\bname\s+(?:would\s+be|is|should\s+be|:)?\s*[\"']?([^\"'\n,]+?)[\"']?(?:\s+and\b|,|$)/i) ||
    userText.match(/\b(?:named|call(?:ed)?\s+it)\s+[\"']?([^\"'\n,]+?)[\"']?(?:\s+and\b|,|$)/i);

  let name = nameMatch?.[1]?.trim() ?? "";
  if (!name) {
    const q = userText.match(/[\"']([^\"']{1,40})[\"']/);
    name = q?.[1]?.trim() ?? "";
  }
  if (!name) {
    const m2 = userText.match(/\bbe\s+([a-z0-9%._-]+)/i);
    name = m2?.[1]?.trim() ?? "";
  }
  if (!name) name = "Discount";

  let value = 10;
  const pct =
    userText.match(/(\d{1,3})\s*%\s*(?:off)?/i) ||
    userText.match(/(\d{1,3})\s*percent/i);
  if (pct) value = Math.min(100, Math.max(1, parseInt(pct[1], 10)));

  const automatic =
    /\b(auto|automatic)\b/i.test(userText) || !/\bcode\b/i.test(userText);

  const { result, run } = await runSkippeTool(
    ctx,
    "create_discount",
    {
      name,
      code: null,
      discount_type: "percentage",
      value,
      is_automatic: automatic,
      is_active: true,
    },
    staffName,
  );

  const reply = run.ok
    ? `✅ ${run.summary}${run.detail ? ` (${run.detail})` : ""}`
    : `⚠️ Couldn't create the discount: ${run.summary}`;

  return { runs: [run], reply };
  }

  return null;
}



/**
 * Phase-1 vision gate: NO tools, NO DB.
 * Forces a FRIDGE / NOT_FRIDGE verdict before any kitchen tools can run.
 * Stops Lovable/dashboard screens from burning list_menu_items credits.
 */
async function classifyBloxburgFridge(args: {
  model: string;
  images: Img[];
  userText: string;
}): Promise<"fridge" | "not_fridge" | "unclear"> {
  const visionImages = args.images.filter((img) => {
    const u = (img?.data_url || "").trim();
    return (
      u.startsWith("data:image/") ||
      u.startsWith("https://") ||
      u.startsWith("http://")
    );
  });
  if (visionImages.length === 0) return "unclear";

  const key = gatewayKey();
  const system = [
    "You classify screenshots for a Bloxburg restaurant tool.",
    "Reply with EXACTLY one token: FRIDGE or NOT_FRIDGE.",
    "FRIDGE only if you see the Bloxburg fridge View Content GUI:",
    "- white panel titled Content",
    "- rows with food icon + quantity number + name + blue Take button",
    "NOT_FRIDGE for: Lovable, code editors, dashboards, browsers, Discord, Skippe UI, dark IDE, blank frames, or anything without Content+Take+qty.",
    "No explanation. One word only.",
  ].join("\n");

  const content: Array<Record<string, unknown>> = [];
  for (const image of visionImages.slice(0, 3)) {
    content.push({
      type: "image_url",
      image_url: { url: image.data_url },
    });
  }
  content.push({
    type: "text",
    text: "Classify this screen. FRIDGE or NOT_FRIDGE only.",
  });

  try {
    const res = await gatewayFetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          Authorization: `Bearer ${key}`,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: args.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
          max_tokens: 8,
          temperature: 0,
        }),
      },
      "fridge-classify",
    );
    if (!res.ok) return "unclear";
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
    if (raw.includes("NOT_FRIDGE") || raw.includes("NOT FRIDGE")) return "not_fridge";
    if (raw.includes("FRIDGE")) return "fridge";
    return "unclear";
  } catch {
    return "unclear";
  }
}

async function transcribeMenuFromImages(args: {
  model: string;
  images: Img[];
  userText: string;
}): Promise<{ items: Array<{ name: string; stock: number }>; raw: string }> {
  const visionImages = args.images.filter((img) => {
    const u = (img?.data_url || "").trim();
    return (
      u.startsWith("data:image/") ||
      u.startsWith("https://") ||
      u.startsWith("http://")
    );
  });
  if (visionImages.length === 0) return { items: [], raw: "" };

  const system = [
    "You OCR Bloxburg food-list screenshots (fridge Content panel, cooking list, or shop list).",
    'Return ONLY valid JSON, no markdown, no explanation: {"items":[{"name":"Pancakes","stock":12}]}',
    "name = exact food label text on a row in the picture (e.g. Pancakes, Boba Tea, Taco). Short dish names only.",
    "stock = the quantity number next to that food, or 0 if not visible.",
    "NEVER invent foods. NEVER copy the chef's chat message as a name.",
    "NEVER use UI chrome as names: Content, Take, Qty, View Content, Stock, Menu, Fridge, Button, Row.",
    "NEVER use instruction phrases: 'these menu items', 'add these', 'from the picture', 'scan this'.",
    'If you cannot read any real food labels: {"items":[]}',
  ].join("\n");

  const content: Array<Record<string, unknown>> = [];
  for (const image of visionImages.slice(0, 9)) {
    content.push({
      type: "image_url",
      image_url: { url: image.data_url, detail: "high" },
    });
  }
  // Do NOT echo the chef's full sentence into the vision prompt — weak models
  // copy it as item names ("these menu items in the picture"). Task is fixed.
  content.push({
    type: "text",
    text: "Read every food name and qty from the image(s) above. JSON only.",
  });

  const key = gatewayKey();
  const res = await gatewayFetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        Authorization: `Bearer ${key}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
    },
    "menu-transcribe",
  );
  if (!res.ok) return { items: [], raw: "" };
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const raw = (data.choices?.[0]?.message?.content || "").trim();
  return { items: parseTranscribedItems(raw), raw };
}

function parseTranscribedItems(raw: string): Array<{ name: string; stock: number }> {
  const items: Array<{ name: string; stock: number }> = [];
  const seen = new Set<string>();

  const push = (name: unknown, stock: unknown) => {
    const n = String(name ?? "").trim();
    if (!n || isBogusMenuName(n)) return;
    // Strip trailing qty that models sometimes glue onto the name ("Pancakes 12")
    const cleaned = n.replace(/\s+[x×]?\s*\d{1,6}\s*$/i, "").trim();
    if (!cleaned || isBogusMenuName(cleaned)) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      name: cleaned.slice(0, 80),
      stock: clampInt(stock, 0, 1_000_000, 0),
    });
  };

  // Prefer strict JSON — line-parse is a last resort and used to pull junk
  // from model prose ("I see Pancakes…" → false positives).
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        items?: Array<{ name?: string; stock?: number }>;
      };
      for (const it of parsed.items ?? []) push(it.name, it.stock);
    } catch {
      /* fall through */
    }
  }

  // Only line-parse if JSON produced nothing AND the response looks like a list
  if (items.length === 0) {
    const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const looksLikeList =
      lines.filter((l) => /^[-*\d•]/.test(l) || /[x×:]\s*\d/.test(l)).length >= 2;
    if (looksLikeList) {
      for (const line of lines) {
        const m = line.match(
          /^\s*(?:[-*•\d\.\)\]]\s*)?([A-Za-z][A-Za-z0-9 .'&]{1,40}?)(?:\s+[-–:x×]?\s*(\d{1,6}))?\s*$/,
        );
        if (m) push(m[1], m[2]);
      }
    }
  }

  return items.slice(0, 80);
}

async function addMenuFromPictures(args: {
  model: string;
  images: Img[];
  userText: string;
  ctx: SkippeContext;
  staffName: string;
}): Promise<SkippeTurn> {
  const runs: SkippeToolRun[] = [];
  const msg = (args.userText || "").toLowerCase();
  const wantsWipe =
    /\b(remove|delete|clear)\s+all\b/.test(msg) ||
    /\bdelete\s+every\b/.test(msg) ||
    /\breplace\b/.test(msg);

  /** Drop any transcribed name that is mostly the chef's own message (model echo). */
  const filterEchoes = (list: Array<{ name: string; stock: number }>) => {
    const chef = (args.userText || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (chef.length < 8) return list.filter((it) => !isBogusMenuName(it.name));
    return list.filter((it) => {
      if (isBogusMenuName(it.name)) return false;
      const n = it.name.toLowerCase();
      // Exact or near-exact copy of the instruction
      if (chef.includes(n) && n.length >= 12) return false;
      if (n.includes(chef) && chef.length >= 8) return false;
      // High overlap with a long instruction sentence
      if (chef.length > 20) {
        const chefWords = new Set(chef.split(" ").filter((w) => w.length > 2));
        const nameWords = n.split(" ").filter((w) => w.length > 2);
        if (nameWords.length >= 2) {
          const overlap = nameWords.filter((w) => chefWords.has(w)).length;
          if (overlap / nameWords.length >= 0.7) return false;
        }
      }
      return true;
    });
  };

  let usedModel = args.model;
  let { items } = await transcribeMenuFromImages({
    model: args.model,
    images: args.images,
    userText: args.userText,
  });
  items = filterEchoes(items);

  // 2.5-lite often returns empty or junk on game UI — one 3.1 pass, then stop.
  if (items.length === 0 && args.model.includes("2.5-flash-lite")) {
    usedModel = MODEL_BY_MODE.lite_31;
    const retry = await transcribeMenuFromImages({
      model: usedModel,
      images: args.images,
      userText: args.userText,
    });
    items = filterEchoes(retry.items);
  }

  if (wantsWipe) {
    const { run } = await runSkippeTool(args.ctx, "delete_all_my_menu_items", {}, args.staffName);
    runs.push(run);
  }

  if (items.length === 0) {
    return {
      reply:
        "I looked at the picture(s) but could not read any food names. Send a closer shot of the Bloxburg list (big text, one panel), or type the names like: `add Pancakes stock 12, Taco stock 5`.",
      thinking: "",
      runs,
      model: usedModel,
    };
  }

  const { run } = await runSkippeTool(
    args.ctx,
    "create_menu_items_batch",
    {
      items: items.map((it) => ({
        name: it.name,
        stock: it.stock,
        category: /holiday|christmas|halloween|valentine|gingerbread|peppermint|candy cane/i.test(
          it.name,
        )
          ? "seasonal"
          : "non_seasonal",
        is_active: true,
      })),
    },
    args.staffName,
  );
  runs.push(run);

  return {
    reply: synthesizeReplyFromRuns(runs),
    thinking: "",
    runs,
    model: usedModel,
  };
}

export async function runSkippeTurn(args: {
  model: string;
  instructions: string;
  history: ChatHistory;
  userText: string;
  images: Img[];
  ctx: SkippeContext;
  staffName: string;
  /** When false, no tools are offered — pure vision/chat, zero kitchen DB. */
  toolsEnabled?: boolean;
}): Promise<SkippeTurn> {
  // Instant kitchen path: priority / clear intents before any LLM gateway call.
  if (
    (args.toolsEnabled !== false) &&
    args.images.length === 0 &&
    (args.userText || "").trim().length > 0
  ) {
    const instant = await maybeRunIntentFallback(
      args.ctx,
      args.staffName,
      args.userText,
      args.history,
    );
    if (instant) {
      return {
        reply: instant.reply,
        runs: instant.runs,
        model: args.model,
      };
    }
  }

  // Pictures + add/create: transcribe first (no tools), then insert. Lite models
  // fail vision+function-calling in one turn — that's why they claimed "Added" with junk names.
  if (
    (args.toolsEnabled !== false) &&
    args.images.length > 0 &&
    askedToAddFromPicture(args.userText, args.images.length)
  ) {
    return addMenuFromPictures({
      model: args.model,
      images: args.images,
      userText: args.userText,
      ctx: args.ctx,
      staffName: args.staffName,
    });
  }

  // ── Vision gate: skip for explicit "add from picture" (classifier wastes a round
  // and 2.5-lite often returns UNCLEAR, blocking the actual create).
  if (args.images.length > 0 && !askedToAddFromPicture(args.userText, args.images.length)) {
    const verdict = await classifyBloxburgFridge({
      model: args.model,
      images: args.images,
      userText: args.userText,
    });

    if (verdict === "not_fridge") {
      return {
        reply:
          "That's not a Bloxburg fridge Content panel. Open the fridge in-game → View Content (white panel, qty numbers, blue Take buttons), Fridge-share the **Roblox** window — not Lovable or this staff tab — then Send.",
        thinking: "",
        runs: [],
        model: args.model,
      };
    }

    if (verdict === "unclear") {
      return {
        reply:
          "I can't confirm a Bloxburg Content panel from these frames (too dark, wrong window, or share paused). Resume share on the Roblox window, open View Content, capture clear rows with Take buttons, then Send.",
        thinking: "",
        runs: [],
        model: args.model,
      };
    }
  }

  const vendor = MODEL_VENDOR[args.model];
  if (vendor === "openai") {
    return runOpenAiTurn({ ...args, toolsEnabled: args.toolsEnabled !== false });
  }
  return runGoogleTurn({ ...args, toolsEnabled: args.toolsEnabled !== false });
}
