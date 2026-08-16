import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend configuration missing");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const prioritySchema = z
  .array(z.object({ owner_id: z.string().uuid(), tier: z.enum(["low", "mid", "high"]) }))
  .max(20)
  .optional();

/** App-side: allow huge bulk quantities. */
const itemsSchema = z
  .array(
    z.object({
      menu_item_id: z.string().uuid(),
      quantity: z.number().int().positive().max(1_000_000),
    }),
  )
  .min(1)
  .max(500);

/**
 * Supabase place_order / preview_order_total still reject quantity > 100.
 * Without a DB change, split each line into chunks of at most 100 so bulk
 * orders (e.g. 112 popcorn) still go through as multiple lines of the same item.
 */
const RPC_QTY_CAP = 100;

function expandItemsForRpc(
  items: Array<{ menu_item_id: string; quantity: number }>,
): Array<{ menu_item_id: string; quantity: number }> {
  const out: Array<{ menu_item_id: string; quantity: number }> = [];
  for (const item of items) {
    let left = item.quantity;
    while (left > 0) {
      const chunk = Math.min(RPC_QTY_CAP, left);
      out.push({ menu_item_id: item.menu_item_id, quantity: chunk });
      left -= chunk;
    }
  }
  if (out.length > 500) {
    throw new Error("Order is too large to submit in one go. Split into a few smaller bulk orders.");
  }
  return out;
}

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        discord_username: z.string().trim().min(2).max(64),
        note: z.string().trim().max(500).optional().nullable(),
        items: itemsSchema,
        promo_code: z.string().trim().max(32).optional().nullable(),
        priority: prioritySchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const rpcItems = expandItemsForRpc(data.items);
    const { data: orderId, error } = await supabase.rpc("place_order" as never, {
      _discord_username: data.discord_username,
      _note: data.note ?? null,
      _items: rpcItems,
      _promo_code: data.promo_code ?? null,
      _priority: data.priority ?? [],
    } as never);
    if (error) throw new Error(error.message);
    return { order_id: orderId as unknown as string };
  });

export const previewOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        items: itemsSchema,
        promo_code: z.string().trim().max(32).optional().nullable(),
        username: z.string().trim().max(64).optional().nullable(),
        priority: prioritySchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const rpcItems = expandItemsForRpc(data.items);
    const { data: rows, error } = await supabase.rpc("preview_order_total" as never, {
      _items: rpcItems,
      _promo_code: data.promo_code ?? null,
      _username: data.username ?? null,
      _priority: data.priority ?? [],
    } as never);
    if (error) throw new Error(error.message);
    const first = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null;

    // Optional chef-written explanation for the Bulk / Fast Service fee (hover text).
    let bulk_fee_message: string | null = null;
    try {
      const { data: feeRows } = await supabase
        .from("bulk_service_fees" as never)
        .select("fee_message,fee_value")
        .gt("fee_value", 0)
        .limit(5);
      const msgs = ((feeRows ?? []) as Array<{ fee_message?: string | null; fee_value: number }>)
        .map((r) => (r.fee_message ?? "").trim())
        .filter(Boolean);
      if (msgs[0]) bulk_fee_message = msgs[0];
    } catch {
      /* table/column may not exist yet */
    }

    return {
      subtotal_bs: Number(first?.["subtotal_bs"] ?? 0),
      discount_bs: Number(first?.["discount_bs"] ?? 0),
      priority_bs: Number(first?.["priority_bs"] ?? 0),
      bulk_service_bs: Number(first?.["bulk_service_bs"] ?? 0),
      bulk_fee_message,
      total_bs: Number(first?.["total_bs"] ?? 0),
      discounts: (first?.["discounts"] as Array<{ name: string; savings_bs: number }>) ?? [],
      applied_label: (first?.["applied_label"] as string | null) ?? null,
    };
  });

export type OrderSummary = {
  id: string;
  discord_username: string;
  total_bs: number;
  subtotal_bs: number;
  discount_bs: number;
  status: string;
  created_at: string;
  item_count: number;
  fulfillments: Array<{ status: string }>;
};

/** Order lookup by the Discord username typed at checkout (not authenticated). */
export const listOrdersForUsername = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ username: z.string().trim().min(2).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const { data: rows, error } = await supabase.rpc("get_orders_for_username" as never, {
      _username: data.username,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as OrderSummary[];
  });
