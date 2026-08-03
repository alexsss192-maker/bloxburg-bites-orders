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
    .from("menu_items" as any)
    .select("id,name,description,price_bs,stock,image_url,category,is_active")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{
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
    const { data: orderId, error } = await supabase.rpc("place_order" as any, {
      _discord_username: data.discord_username,
      _note: data.note ?? null,
      _items: data.items,
    } as any);
    if (error) throw new Error(error.message);
    return { order_id: orderId as unknown as string };
  });

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase.rpc("get_order_public" as any, { _order_id: data.id } as any);
    if (error) throw new Error(error.message);
    const first = Array.isArray(rows) ? rows[0] : rows;
    if (!first) throw new Error("Order not found");
    return first as unknown as {
      id: string;
      discord_username: string;
      note: string | null;
      total_bs: number;
      status: string;
      created_at: string;
      items: Array<{ item_name: string; quantity: number; unit_price_bs: number }>;
    };
  });

export const getStockByNames = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ names: z.array(z.string()).min(1).max(50) }).parse(d))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase
      .from("menu_items" as any)
      .select("name,stock,is_active")
      .in("name", data.names);
    if (error) throw new Error(error.message);
    const map: Record<string, { stock: number; is_active: boolean }> = {};
    for (const r of (rows ?? []) as unknown as Array<{ name: string; stock: number; is_active: boolean }>) {
      map[r.name] = { stock: r.stock, is_active: r.is_active };
    }
    return map;
  });

// -------- staff functions --------

async function assertStaff(context: { supabase: ReturnType<typeof createClient<Database>>; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles" as any)
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data as unknown as Array<{ role: string }> | null)?.map((r) => r.role) ?? [];
  const isAdmin = roles.includes("admin");
  const isChef = roles.includes("chef");
  if (!isAdmin && !isChef) throw new Error("Forbidden");
  return { isAdmin, isChef, roles };
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles" as any)
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data as unknown as Array<{ role: string }> | null)?.map((r) => r.role) ?? [];
    return { roles, isAdmin: roles.includes("admin"), isChef: roles.includes("chef") };
  });

export const listAllMenu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertStaff(context);
    let query = context.supabase
      .from("menu_items" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (!isAdmin) {
      query = query.eq("owner_id", context.userId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data as unknown as Array<{
      id: string;
      name: string;
      description: string;
      price_bs: number;
      stock: number;
      image_url: string | null;
      category: string;
      is_active: boolean;
      owner_id: string | null;
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
    await assertStaff(context);
    if (data.id) {
      // Ownership enforced by RLS for chefs; admins can update anything.
      const { error } = await context.supabase
        .from("menu_items" as any)
        .update({ ...data, category: "non_seasonal" as const })
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    // Chefs own the items they create; admins may leave owner_id null (shared).
    const payload = {
      ...data,
      category: "non_seasonal" as const,
      owner_id: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("menu_items" as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id };
  });

export const deleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    // RLS enforces chefs may only delete rows they own.
    const { error } = await context.supabase
      .from("menu_items" as any)
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data: orders, error } = await context.supabase
      .from("orders" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = ((orders as unknown as Array<{ id: string }> | null) ?? []).map((o) => o.id);
    const { data: items } = ids.length
      ? await context.supabase.from("order_items" as any).select("*").in("order_id", ids)
      : { data: [] as unknown as Array<Record<string, unknown>> };
    const { data: fulfillments } = ids.length
      ? await context.supabase.from("order_fulfillments" as any).select("*").in("order_id", ids)
      : { data: [] as unknown as Array<Record<string, unknown>> };
    return {
      orders: (orders ?? []) as unknown as Array<{
        id: string;
        discord_username: string;
        note: string | null;
        total_bs: number;
        subtotal_bs: number;
        discount_bs: number;
        status: string;
        created_at: string;
      }>,
      items: (items ?? []) as unknown as Array<{
        order_id: string;
        item_name: string;
        quantity: number;
        unit_price_bs: number;
        subtotal_bs: number;
        discount_bs: number;
      }>,
      fulfillments: (fulfillments ?? []) as unknown as Array<{
        id: string; order_id: string; chef_id: string | null; status: string; subtotal_bs: number; discount_bs: number; total_bs: number;
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
      .from("order_fulfillments" as any)
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const discountInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(2).max(32).optional().nullable(),
  discount_type: z.enum(["percentage", "fixed"]),
  value: z.number().int().positive().max(100000000),
  is_automatic: z.boolean(),
  is_active: z.boolean(),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
});

export const listDiscounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { data, error } = await context.supabase.from("chef_discounts" as any).select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{ id: string; name: string; code: string | null; discount_type: "percentage" | "fixed"; value: number; is_automatic: boolean; is_active: boolean; starts_at: string | null; ends_at: string | null }>;
  });

export const upsertDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => discountInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    if (data.discount_type === "percentage" && data.value > 100) throw new Error("Percentage cannot exceed 100");
    const payload = { ...data, code: data.is_automatic ? null : data.code?.toUpperCase(), owner_id: context.userId };
    if (data.id) {
      const { error } = await context.supabase.from("chef_discounts" as any).update(payload).eq("id", data.id).eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("chef_discounts" as any).insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id };
  });

export const deleteDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    const { error } = await context.supabase.from("chef_discounts" as any).delete().eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRoles } = await context.supabase.from("user_roles" as any).select("user_id,role");
    const { data: usersResp, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const roles = (userRoles as unknown as Array<{ user_id: string; role: string }> | null) ?? [];
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
        .from("user_roles" as any)
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_roles" as any)
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
      .from("user_roles" as any)
      .upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });
    if (rerr) throw new Error(rerr.message);
    return { id: uid };
  });