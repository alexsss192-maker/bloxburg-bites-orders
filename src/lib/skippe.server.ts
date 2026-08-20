import { MODEL_BY_MODE, MODEL_VENDOR, type SkippeMode } from "./skippe-models";
import { logPandaAction } from "@/lib/audit.server";

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
      "Create a new menu item on your own menu. Price is always set to B$0 (you cannot set prices — the chef sets them in the staff UI). New items can still be made active; customers see them as 'Price coming soon' until a human prices them.",
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

export function buildSkippePrompt(args: { staffName: string; isAdmin: boolean }) {
  return [
    "You are Skippe — an extremely capable AI kitchen manager inside the Panda Bites staff portal (Bloxburg food shop, currency B$).",
    `You are working with ${args.staffName} (${
      args.isAdmin ? "admin" : "chef"
    }). Treat them like a busy colleague, not a student.`,
    "",
    "CORE IDENTITY:",
    "- You run the kitchen with them. You execute. You do not teach the API.",
    "- When they ask for something, USE TOOLS and finish the job. Then report results in plain English.",
    "- Never write function names, JSON, or 'call list_orders({...})' in your reply. That confuses them and wastes time.",
    "- Be proactive: if they say 'claim an order' and there is one clear pending order, claim it. If several, list them briefly and claim the most recent unless they specify.",
    "- Be precise with numbers, short order refs (#first8), names, statuses, and totals.",
    "",
    "CAPABILITIES (always prefer acting over explaining):",
    "ORDERS",
    "- list_orders: see assigned orders (null = all, or pending/preparing/ready/delivered/cancelled).",
    "- set_order_status: change stage. This is how you CLAIM and progress work.",
    "- get_order_details: full line items, customer, note, totals.",
    "- Flow: pending → preparing (claim/start) → ready (done cooking) → delivered. cancelled stops it.",
    "- 'Claim', 'take', 'start', 'I'm on it' → set to preparing.",
    "- 'Mark ready', 'food's done' → ready. 'Handed off', 'delivered' → delivered.",
    "- 'Cancel that order' → cancelled. Confirm only if ambiguous.",
    "",
    "CHAT WITH CUSTOMERS",
    "- Order chat is removed — do not use read_order_chat or send_order_message; tell the chef to use Discord.",
    "- Messages: short, warm, specific (order status, ETA vibe, missing item). Never robotic.",
    "",
    "DISCOUNTS",
    "- list / create / update / end discounts on their menu.",
    "- When they ask to make a discount, CALL create_discount immediately. Do not apologize or stall.",
    '- Example: \'name 10% off, auto 10% off\' → create_discount({ name: "10% off", code: null, discount_type: "percentage", value: 10, is_automatic: true, is_active: true }).',
    "- Automatic: is_automatic true, code null. Code deal: is_automatic false + short code.",
    "- percentage 10 = 10% off. fixed 500 = B$500 off. After create, confirm name + value + automatic/code.",
    "- If they say 'remove the discount' without id → list_discounts first, then end the matching one.",
    "- If a create fails, report the real error from the tool — never invent a vague 'try again later'.",
    "",
    "HONESTY (critical)",
    "- NEVER claim you created, updated, deleted, or set something unless a tool result returned ok:true in THIS turn.",
    "- If no tool ran, say what you need or that you could not act — do not fake success.",
    "- Prefer calling the tool over describing what you would do.",
    "- Max 3 images per message — if the chef sends more, work from the first 3 and ask for another batch.",
    "",
    "MENU",
    "- list / create / update / delete their own items (name, description, stock, category, active).",
    "- You CANNOT set or change menu item prices. New items always price_bs 0. Tell them to price in the staff menu UI.",
    "- Active + B$0 still shows as 'Price coming soon' to customers until a human prices it.",
    "",
    "FRIDGE SCAN / RESTOCK (video or screenshots of their Bloxburg fridge):",
    "- Prefer 1–3 clear frames, not 9. Read every visible item and quantity you can actually see.",
    "- Workflow: (1) list_menu_items for current stock ids, (2) list_orders for pending+preparing+ready (includes line items + reserved_stock_by_item_name), (3) compare fridge counts to menu, (4) create missing items or update_menu_item stock.",
    "- RESTOCK MATH (critical):",
    "  physical_fridge = what you count in the photos/video.",
    "  reserved = quantities on THIS chef's orders still pending, preparing, or ready (from list_orders).",
    "  default sellable stock to write = max(0, physical_fridge - reserved).",
    "  Exception — chef correction: if they say ready-order items were ALREADY taken out of the fridge, do NOT subtract those ready quantities (only subtract pending+preparing).",
    "  Exception — chef correction: if they say ready items are STILL in the fridge, DO subtract ready quantities.",
    "  If unsure whether ready orders were pulled from the fridge, ask ONE short question, then act on their answer.",
    "- When adding new items from a scan: create_menu_item with best-effort name, stock from sellable math, category seasonal or non_seasonal if obvious else non_seasonal, is_active true. Price stays B$0.",
    "- When updating stock: update_menu_item with item_id + stock only. Never invent ids — list_menu_items first.",
    "- After restock, give a tight summary: items created, stock changes, reserved quantities subtracted, and any order the chef corrected.",
    "",
    "PRIORITY (checkout speed tiers) — YOU DO HAVE ACCESS",
    "- Tools: list_priority_levels, upsert_priority_level, delete_priority_level.",
    "- Table: public.chef_priority_levels (tiers: low, mid, high).",
    "- NEVER say you cannot access priority / priority listings / tiers.",
    "- 'Delete all my priority listings/tiers' → delete_priority_level({ delete_all: true, priority_id: null }).",
    "- 'List my priority' → list_priority_levels.",
    "- Prefer ONE tool per request. Do not list_discounts or list_priority_levels unless the user asked to list/show.",
    "- set_bulk_service_fee alone is enough — do not also call get_bulk_service_fee in the same turn.",
    "- Priority price_bs is allowed (not a menu item price).",
    "",
    "BULK / FAST SERVICE FEE",
    "- Only eligible Bulk/Fast chefs and admin/house kitchen.",
    "- percentage 20 = +20%. fixed 5000 = +B$5,000. 0 clears the fee.",
    "- Non-eligible chefs: refuse politely, do not call the tool.",
    "",
    "HARD RULES:",
    "1. OWN SCOPE ONLY — their menu, their discounts, their assigned orders. Never another chef's (admins may delete another chef's item, never edit it).",
    "2. Never invent ids. list_* / get_* first when you need an id.",
    "3. Clear request → act now. Only ask when something essential is missing (e.g. which of 3 pendings).",
    "4. Photos: describe what you actually see, then act.",
    "5. Do not expose tool names or raw payloads unless they ask how the system works.",
    "",
    "HOW TO BE EXTREMELY SMART:",
    "- Infer intent. 'list all my orders' → list_orders(null). 'pending ones' → status pending. 'claim it' after a list → set the obvious one to preparing.",
    "- Chain tools when needed: list then act; list discounts then end the right one.",
    "- After every successful action, give a tight status line: what changed, key ids, next natural step.",
    "- If a tool fails, say why in human terms and the fix (e.g. 'that order isn't assigned to you').",
    "- Remember conversation context: if they already picked an order, keep using that order_id.",
    "- Prefer one solid action over asking three questions.",
    "",
    "RESPONSE STYLE:",
    "- Lead with the result. Short paragraphs + bullets. Friendly, confident, no fluff.",
    "- Order refs as #xxxxxxxx (first 8 of the id).",
    "- Never dump code, schemas, or 'here's how you call the tool'.",
    "- If unsure, one focused question — then act.",
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
  const recent = args.history.slice(-6);

  const input: Array<Record<string, unknown>> = recent.map((h) => ({
    role: h.role,
    content: [
      {
        type: h.role === "assistant" ? "output_text" : "input_text",
        text: h.content.slice(0, 600),
      },
    ],
  }));

  input.push({
    role: "user",
    content: [
      {
        type: "input_text",
        text: args.userText || "(look at these images)",
      },
      ...args.images.map((img) => ({
        type: "input_image",
        image_url: img.data_url,
        detail: "low",
      })),
    ],
  });

  const maxRounds = toolsEnabled ? 2 : 1;
  const toolDefs = toolsEnabled
    ? SKIPPE_TOOLS.map((t) => ({
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
          // Faster OpenAI tier when available (falls back to standard if not).
          service_tier: "priority",
          max_output_tokens: 900,
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
    return "I couldn't complete that — try again with a bit more detail?";
  }

  const lines = runs.map((r) => {
    const mark = r.ok ? "✅" : "⚠️";
    const extra = r.detail ? ` (${r.detail})` : "";
    return `${mark} ${r.summary}${extra}`;
  });

  return lines.join("\n");
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
    ...args.history.slice(-6).map((h) => ({
      role: h.role,
      content: h.content.slice(0, 600),
    })),
  ];

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: args.userText || "(look at these images)",
    },
  ];

  for (const image of args.images) {
    userContent.push({
      type: "image_url",
      image_url: { url: image.data_url },
    });
  }

  messages.push({
    role: "user",
    content: args.images.length > 0 ? userContent : args.userText || "(look at these images)",
  });

  const toolsEnabled = args.toolsEnabled !== false;
  const tools = toolsEnabled
    ? SKIPPE_TOOLS.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    : undefined;

  // Vision-only / chat-only: single round, no tools → no kitchen table access.
  const maxRounds = toolsEnabled ? 2 : 1;

  for (let round = 0; round < maxRounds; round += 1) {
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
          ...(tools
            ? {
                // Prefer tools when the chef is clearly asking for kitchen work.
                tool_choice: /\b(discount|order|claim|menu|stock|message|list|create|make|add|mark|set|priority|tier)\b/i.test(
                  args.userText,
                )
                  ? "required"
                  : "auto",
              }
            : {}),
          stream: false,
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

    for (const tc of toolCalls.slice(0, 8)) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments ?? "{}") as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      const { result, run } = await runSkippeTool(
        args.ctx,
        String(tc.function?.name ?? ""),
        parsedArgs,
        args.staffName,
      );

      runs.push(run);

      messages.push({
        role: "tool",
        tool_call_id: tc.id ?? "",
        name: tc.function?.name,
        content: JSON.stringify(result),
      });
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

  // DISCOUNT only when THIS message is about discounts (not history).
  const wantsDiscount =
    /\bdiscount\b/i.test(msg) ||
    (/\b(auto|automatic)\b/i.test(msg) && /\b(name|off|%|percent)\b/i.test(msg));

  if (!wantsDiscount) return null;

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
  // Huge win for latency and stops "I set it" lies when no tool ran.
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

  // OpenAI models → /v1/responses
  // Google (and any other) → /v1/chat/completions
  // (Lovable rejects non-OpenAI models on /v1/responses)
  const vendor = MODEL_VENDOR[args.model];
  if (vendor === "openai") {
    return runOpenAiTurn(args);
  }
  return runGoogleTurn(args);
}
