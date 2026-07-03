import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

function serverPublicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const getPublicMenu = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();
  const { data, error } = await supabase
    .from("menu_items" as never)
    .select("id,name,description,price_bs,stock,image_url,category,is_active")
    .eq("is_active", true)
    .eq("category", "non_seasonal")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    name: string;
    description: string;
    price_bs: number;
    stock: number;
    image_url: string | null;
    category: "non_seasonal" | "seasonal";
    is_active: boolean;
  }>;
});

const orderInput = z.object({
  discord_username: z.string().trim().min(2).max(64),
  note: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().positive().max(100) }))
    .min(1)
    .max(50),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: orderId, error } = await supabase.rpc("place_order" as never, {
      _discord_username: data.discord_username,
      _note: data.note ?? null,
      _items: data.items,
    } as never);
    if (error) throw new Error(error.message);
    return { order_id: orderId as unknown as string };
  });

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase.rpc("get_order_public" as never, { _order_id: data.id } as never);
    if (error) throw new Error(error.message);
    const first = Array.isArray(rows) ? rows[0] : rows;
    if (!first) throw new Error("Order not found");
    return first as {
      id: string;
      discord_username: string;
      note: string | null;
      total_bs: number;
      status: string;
      created_at: string;
      items: Array<{ item_name: string; quantity: number; unit_price_bs: number }>;
    };
  });

// -------- staff functions --------

async function assertStaff(context: { supabase: ReturnType<typeof createClient<Database>>; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles" as never)
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data as Array<{ role: string }> | null)?.map((r) => r.role) ?? [];
  const isAdmin = roles.includes("admin");
  const isChef = roles.includes("chef");
  if (!isAdmin && !isChef) throw new Error("Forbidden");
  return { isAdmin, isChef, roles };
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data as Array<{ role: string }> | null)?.map((r) => r.role) ?? [];
    return { roles, isAdmin: roles.includes("admin"), isChef: roles.includes("chef") };
  });

export const listAllMenu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data, error } = await context.supabase
      .from("menu_items" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as Array<{
      id: string;
      name: string;
      description: string;
      price_bs: number;
      stock: number;
      image_url: string | null;
      category: string;
      is_active: boolean;
    }>;
  });

const menuUpsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  price_bs: z.number().int().min(0).max(100000000),
  stock: z.number().int().min(0).max(1000000),
  image_url: z.string().url().max(2000).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const upsertMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => menuUpsert.parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    const payload = { ...data, category: "non_seasonal" as const };
    if (data.id) {
      const { error } = await context.supabase.from("menu_items" as never).update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("menu_items" as never)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const deleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    const { error } = await context.supabase.from("menu_items" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data: orders, error } = await context.supabase
      .from("orders" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = ((orders as Array<{ id: string }> | null) ?? []).map((o) => o.id);
    const { data: items } = ids.length
      ? await context.supabase.from("order_items" as never).select("*").in("order_id", ids)
      : { data: [] as Array<Record<string, unknown>> };
    return {
      orders: (orders ?? []) as Array<{
        id: string;
        discord_username: string;
        note: string | null;
        total_bs: number;
        status: string;
        created_at: string;
      }>,
      items: (items ?? []) as Array<{
        order_id: string;
        item_name: string;
        quantity: number;
        unit_price_bs: number;
      }>,
    };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "preparing", "ready", "delivered", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    const { error } = await context.supabase
      .from("orders" as never)
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRoles } = await context.supabase.from("user_roles" as never).select("user_id,role");
    const { data: usersResp, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const roles = (userRoles as Array<{ user_id: string; role: string }> | null) ?? [];
    return usersResp.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role),
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), role: z.enum(["admin", "chef"]), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    if (data.enabled) {
      const { error } = await context.supabase
        .from("user_roles" as never)
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_roles" as never)
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const createStaffInput = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(200),
  role: z.enum(["admin", "chef"]),
});

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createStaffInput.parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    const { error: rerr } = await context.supabase
      .from("user_roles" as never)
      .upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });
    if (rerr) throw new Error(rerr.message);
    return { id: uid };
  });