import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrderMessage = {
  id: string;
  sender_kind: "customer" | "chef" | "system";
  author_name: string;
  body: string;
  created_at: string;
};

async function anonClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend configuration missing");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/** Anyone holding the order link can read that order's thread. */
export const getOrderMessages = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const { data: rows, error } = await supabase.rpc("get_order_messages" as never, {
      _order_id: data.order_id,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as OrderMessage[];
  });

export const postCustomerMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        author_name: z.string().trim().min(2).max(64),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await anonClient();
    const { error } = await supabase.rpc("post_order_message" as never, {
      _order_id: data.order_id,
      _author_name: data.author_name,
      _body: data.body,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Chef/admin side: RLS only lets them touch orders they are cooking for. */
export const listChefMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("order_messages")
      .select("id, sender_kind, author_name, body, created_at")
      .eq("order_id", data.order_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as OrderMessage[];
  });

export const postChefMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        author_name: z.string().trim().min(2).max(64),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("order_messages").insert({
      order_id: data.order_id,
      sender_kind: "chef",
      author_name: data.author_name,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });