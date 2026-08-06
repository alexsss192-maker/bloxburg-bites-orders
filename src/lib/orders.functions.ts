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

const itemsSchema = z
  .array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().positive().max(100) }))
  .min(1)
  .max(50);

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        discord_username: z.string().trim().min(2).max(64),
        note: z.string().trim().max(500).optional().nullable(),
        items: itemsSchema,
        promo_code: z.string().trim().max(32).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const { data: orderId, error } = await supabase.rpc("place_order" as never, {
      _discord_username: data.discord_username,
      _note: data.note ?? null,
      _items: data.items,
      _promo_code: data.promo_code ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { order_id: orderId as unknown as string };
  });

export const previewOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ items: itemsSchema, promo_code: z.string().trim().max(32).optional().nullable() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const { data: rows, error } = await supabase.rpc("preview_order_total" as never, {
      _items: data.items,
      _promo_code: data.promo_code ?? null,
    } as never);
    if (error) throw new Error(error.message);
    const first = Array.isArray(rows) ? rows[0] : rows;
    return (first ?? { subtotal_bs: 0, discount_bs: 0, total_bs: 0, discounts: [] }) as {
      subtotal_bs: number;
      discount_bs: number;
      total_bs: number;
      discounts: Array<{ name: string; savings_bs: number }>;
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