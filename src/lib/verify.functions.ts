import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export const getVerifiedSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readCookie, verifyPayload, VERIFY_COOKIE } = await import("@/lib/verify-cookie.server");
  const cookies = getRequestHeader("cookie");
  const token = readCookie(cookies ?? null, VERIFY_COOKIE);
  const payload = verifyPayload(token);
  if (!payload) return null;
  return {
    discord_id: payload.discord_id,
    username: payload.username,
    avatar_url: payload.avatar_url,
  };
});

export const listMyOrders = createServerFn({ method: "GET" }).handler(async () => {
  const { readCookie, verifyPayload, VERIFY_COOKIE } = await import("@/lib/verify-cookie.server");
  const cookies = getRequestHeader("cookie");
  const token = readCookie(cookies ?? null, VERIFY_COOKIE);
  const payload = verifyPayload(token);
  if (!payload) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_orders_for_discord" as never, {
    _discord_id: payload.discord_id,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{
    id: string;
    discord_username: string;
    total_bs: number;
    status: string;
    created_at: string;
    item_count: number;
  }>;
});

// Extended placeOrder that pulls verified_discord_id from cookie server-side.
const orderInput = z.object({
  discord_username: z.string().trim().min(2).max(64),
  note: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().positive().max(100) }))
    .min(1)
    .max(50),
});

export const placeVerifiedOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => orderInput.parse(d))
  .handler(async ({ data }) => {
    const { readCookie, verifyPayload, VERIFY_COOKIE } = await import("@/lib/verify-cookie.server");
    const { createClient } = await import("@supabase/supabase-js");
    const cookies = getRequestHeader("cookie");
    const token = readCookie(cookies ?? null, VERIFY_COOKIE);
    const payload = verifyPayload(token);
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: orderId, error } = await supabase.rpc("place_order" as never, {
      _discord_username: data.discord_username,
      _note: data.note ?? null,
      _items: data.items,
      _verified_discord_id: payload?.discord_id ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { order_id: orderId as unknown as string };
  });