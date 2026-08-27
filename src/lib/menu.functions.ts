import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeStaffUsername, staffUsernameToEmail } from "@/lib/staff-username";
import type { Database } from "@/integrations/supabase/types";
import { isBulkChefUsername } from "@/lib/bulk-department";

function serverPublicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type PublicMenuItem = {
  id: string;
  name: string;
  description: string;
  price_bs: number;
  stock: number;
  image_url: string | null;
  category: "non_seasonal" | "seasonal";
  is_active: boolean;
  owner_id: string | null;
};

export const getPublicMenu = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();
  const { data, error } = await supabase
    .from("menu_items" as any)
    .select("id,name,description,price_bs,stock,image_url,category,is_active,owner_id")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PublicMenuItem[];
});

export type PublicChef = {
  owner_id: string;
  username: string;
  is_admin: boolean;
  first_item_at: string;
  item_count: number;
};

/** Every kitchen with live items: the admin menu is pinned first, then oldest menu first. */
export const getPublicChefs = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();

  // The RPC is the preferred path because it also marks the admin kitchen.
  // If an older Supabase schema has not applied the RPC migration yet, fall
  // back to the public tables so /menu can still render instead of returning 500.
  const { data, error } = await supabase.rpc("get_public_chefs" as any);

  if (!error) {
    return (data ?? []) as unknown as PublicChef[];
  }

  const isMissingRpc = /get_public_chefs|schema cache|function .* without parameters/i.test(
    error.message,
  );

  if (!isMissingRpc) {
    throw new Error(error.message);
  }

  const [{ data: menuRows, error: menuError }, { data: profiles, error: profileError }] =
    await Promise.all([
      supabase
        .from("menu_items" as any)
        .select("owner_id,created_at")
        .eq("is_active", true)
        .not("owner_id", "is", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("staff_profiles" as any)
        .select("user_id,username"),
    ]);

  if (menuError) throw new Error(menuError.message);
  if (profileError) throw new Error(profileError.message);

  const usernameByUserId = new Map<string, string>();
  for (const row of (profiles ?? []) as unknown as Array<{
    user_id: string;
    username: string | null;
  }>) {
    usernameByUserId.set(row.user_id, row.username?.trim() || "Chef");
  }

  const chefs = new Map<string, PublicChef>();

  for (const row of (menuRows ?? []) as unknown as Array<{
    owner_id: string;
    created_at: string;
  }>) {
    const existing = chefs.get(row.owner_id);

    if (existing) {
      existing.item_count += 1;
      continue;
    }

    chefs.set(row.owner_id, {
      owner_id: row.owner_id,
      username: usernameByUserId.get(row.owner_id) ?? "Chef",
      is_admin: false,
      first_item_at: row.created_at,
      item_count: 1,
    });
  }

  return Array.from(chefs.values());
});

export type PublicDeal = {
  id: string;
  owner_id: string;
  chef_username: string;
  is_admin: boolean;
  name: string;
  code: string | null;
  discount_type: "percentage" | "fixed";
  value: number;
  is_automatic: boolean;
  ends_at: string | null;
};

/** Live discounts, public so customers can grab a code without digging through checkout. */
export const getPublicDeals = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();

  const { data, error } = await supabase.rpc("get_public_discounts" as any);

  if (!error) {
    return (data ?? []) as unknown as PublicDeal[];
  }

  const isMissingRpc = /get_public_discounts|schema cache|function .* without parameters/i.test(
    error.message,
  );

  if (!isMissingRpc) {
    throw new Error(error.message);
  }

  // Graceful fallback for projects whose migration has not reached the live
  // Supabase schema yet. Public policies already allow reading active deals.
  const [{ data: discounts, error: discountsError }, { data: profiles, error: profileError }] =
    await Promise.all([
      supabase
        .from("chef_discounts" as any)
        .select(
          "id,owner_id,name,code,discount_type,value,is_automatic,ends_at,starts_at,created_at,is_active",
        )
        .eq("is_active", true)
        .or("starts_at.is.null,starts_at.lte." + new Date().toISOString())
        .or("ends_at.is.null,ends_at.gt." + new Date().toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("staff_profiles" as any)
        .select("user_id,username"),
    ]);

  if (discountsError) throw new Error(discountsError.message);
  if (profileError) throw new Error(profileError.message);

  const usernameByUserId = new Map<string, string>();
  for (const row of (profiles ?? []) as unknown as Array<{
    user_id: string;
    username: string | null;
  }>) {
    usernameByUserId.set(row.user_id, row.username?.trim() || "Chef");
  }

  return ((discounts ?? []) as unknown as Array<{
    id: string;
    owner_id: string;
    name: string;
    code: string | null;
    discount_type: "percentage" | "fixed";
    value: number;
    is_automatic: boolean;
    ends_at: string | null;
  }>).map((discount) => ({
    id: discount.id,
    owner_id: discount.owner_id,
    chef_username: usernameByUserId.get(discount.owner_id) ?? "Chef",
    is_admin: false,
    name: discount.name,
    code: discount.code,
    discount_type: discount.discount_type,
    value: discount.value,
    is_automatic: discount.is_automatic,
    ends_at: discount.ends_at,
  }));
});

/** No artificial order size limits — bulk carts (4 trays / 84+ items) must work. */
const orderInput = z.object({
  discord_username: z.string().trim().min(2).max(64),
  note: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        quantity: z.number().int().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(500),
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
      fulfillments: Array<{
        status: string;
        total_bs: number;
        cancel_reason: string | null;
        priority_label: string | null;
        priority_color: string | null;
      }>;
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

async function usernameMap(context: { supabase: ReturnType<typeof createClient<Database>> }) {
  const { data } = await context.supabase.from("staff_profiles" as any).select("user_id,username");
  const map: Record<string, string> = {};
  for (const row of (data as unknown as Array<{ user_id: string; username: string }> | null) ?? []) {
    map[row.user_id] = row.username;
  }
  return map;
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles" as any)
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data as unknown as Array<{ role: string }> | null)?.map((r) => r.role) ?? [];

    const isAdmin = roles.includes("admin");
    const isChef = roles.includes("chef");

    const { data: profile } = await context.supabase
      .from("staff_profiles" as any)
      .select("username")
      .eq("user_id", context.userId)
      .maybeSingle();
    const username =
      (profile as unknown as { username: string } | null)?.username ?? null;

    // Admins are always both normal + bulk / Fast Service (current and future).
    // Named bulk chefs are bulk via BULK_CHEF_USERNAMES.
    const isBulkChef = isAdmin || isBulkChefUsername(username);

    return {
      roles,
      isAdmin,
      isChef,
      isBulkChef,
      username,
    };
  });

export const listAllMenu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Every staff member (admin or chef) only sees their own menu items.
    await assertStaff(context);
    const { data, error } = await context.supabase
      .from("menu_items" as any)
      .select(
        "id,name,description,price_bs,stock,image_url,category,is_active,owner_id,created_at",
      )
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      my_user_id: context.userId,
      is_admin: false,
      owner_names: {} as Record<string, string>,
      items: data as unknown as Array<{
        id: string;
        name: string;
        description: string;
        price_bs: number;
        stock: number;
        image_url: string | null;
        category: string;
        is_active: boolean;
        owner_id: string | null;
      }>,
    };
  });

const menuUpsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  price_bs: z.number().int().min(0).max(100000000),
  stock: z.number().int().min(0).max(1000000),
  // low_stock_threshold is NOT in the live menu_items schema — do not send it.
  image_url: z.string().url().max(2000).optional().nullable(),
  category: z.enum(["non_seasonal", "seasonal"]).default("non_seasonal"),
  is_active: z.boolean().default(true),
});

export const upsertMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => menuUpsert.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    // Only columns that exist on public.menu_items
    const payload = {
      name: data.name,
      description: data.description,
      price_bs: data.price_bs,
      stock: data.stock,
      image_url: data.image_url ?? null,
      category: data.category,
      is_active: data.is_active,
    };
    if (data.id) {
      // Everyone — admins included — may only ever edit their own items.
      const { data: existing } = await context.supabase
        .from("menu_items" as any)
        .select("owner_id")
        .eq("id", data.id)
        .maybeSingle();
      const owner = (existing as unknown as { owner_id: string | null } | null)?.owner_id ?? null;
      if (owner !== context.userId) throw new Error("You can only edit your own menu items");
      const { error } = await context.supabase
        .from("menu_items" as any)
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("menu_items" as any)
      .insert({ ...payload, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id };
  });

/**
 * Permanently delete a menu item so it disappears from the staff menu.
 * Order line history keeps the item name on order_items; we null menu_item_id
 * when the FK blocks a hard delete, then delete the row.
 */
export const deleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context);

    const { data: existing } = await context.supabase
      .from("menu_items" as any)
      .select("owner_id, name")
      .eq("id", data.id)
      .maybeSingle();

    const row = existing as unknown as { owner_id: string | null; name: string } | null;
    if (!row) throw new Error("Menu item not found");
    if (row.owner_id !== context.userId) {
      throw new Error("You can only delete your own menu items");
    }

    // Best-effort: clear alerts / FK refs so hard delete can succeed
    try {
      await context.supabase.from("stock_alerts" as any).delete().eq("menu_item_id", data.id);
    } catch {
      /* table may not exist */
    }
    try {
      await context.supabase
        .from("order_items" as any)
        .update({ menu_item_id: null })
        .eq("menu_item_id", data.id);
    } catch {
      /* column may be NOT NULL — hard delete may still work if no rows */
    }

    const { error } = await context.supabase
      .from("menu_items" as any)
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);

    if (error) {
      // Last resort: hide permanently from staff + public lists
      const { error: softErr } = await context.supabase
        .from("menu_items" as any)
        .update({ is_active: false, stock: 0 })
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (softErr) throw new Error(error.message);
      // Staff list still filters these out below
    }

    return { ok: true };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);

    // After staff check, use service-role client so RLS "assigned chef only"
    // does not hide orders when menu_items.owner_id / fulfillment.chef_id
    // do not match the logged-in user (common after partial migrations).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    // Cap for chef UI: at most 40 recent orders. Delivered/cancelled older
    // than 7 days are dropped from the chef queue (customers still see them
    // in their own order history via get_orders_for_username).
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Prefer full column list; if a column is missing on a partial migration,
    // fall back so the chef queue never goes blank.
    const orderColsFull =
      "id,discord_username,note,subtotal_bs,discount_bs,total_bs,status,created_at,discount_label,priority_tier,priority_label,priority_color,priority_price_bs,cancel_reason";
    const orderColsSafe =
      "id,discord_username,note,subtotal_bs,discount_bs,total_bs,status,created_at";

    let rawOrders: unknown[] | null = null;
    {
      const first = await db
        .from("orders" as any)
        .select(orderColsFull)
        .order("created_at", { ascending: false })
        .limit(80);
      if (first.error) {
        const second = await db
          .from("orders" as any)
          .select(orderColsSafe)
          .order("created_at", { ascending: false })
          .limit(80);
        if (second.error) throw new Error(second.error.message);
        rawOrders = second.data as unknown[] | null;
      } else {
        rawOrders = first.data as unknown[] | null;
      }
    }

    const all = (rawOrders ?? []) as unknown as Array<{
      id: string;
      discord_username: string;
      note: string | null;
      total_bs: number;
      subtotal_bs: number;
      discount_bs: number;
      status: string;
      created_at: string;
      priority_tier: string | null;
      priority_label: string | null;
      priority_color: string | null;
      priority_price_bs: number;
      cancel_reason: string | null;
    }>;

    const HISTORY = new Set(["delivered", "cancelled"]);
    const filtered = all.filter((o) => {
      if (!HISTORY.has(o.status)) return true;
      return o.created_at >= weekAgo;
    });

    const truncated = filtered.length > 40;
    const orders = filtered.slice(0, 40);
    const ids = orders.map((o) => o.id);

    const { data: items } = ids.length
      ? await db
          .from("order_items" as any)
          .select(
            "id,order_id,menu_item_id,item_name,quantity,unit_price_bs,subtotal_bs,discount_bs,discount_name,owner_id",
          )
          .in("order_id", ids)
      : { data: [] as unknown as Array<Record<string, unknown>> };
    let fulfillments: unknown[] | null = [];
    if (ids.length) {
      const fulColsFull =
        "id,order_id,chef_id,status,subtotal_bs,discount_bs,total_bs,priority_tier,priority_label,priority_color,priority_price_bs,cancel_reason,created_at,updated_at";
      const fulColsSafe =
        "id,order_id,chef_id,status,subtotal_bs,discount_bs,total_bs,created_at,updated_at";
      const ful1 = await db
        .from("order_fulfillments" as any)
        .select(fulColsFull)
        .in("order_id", ids);
      if (ful1.error) {
        const ful2 = await db
          .from("order_fulfillments" as any)
          .select(fulColsSafe)
          .in("order_id", ids);
        if (ful2.error) throw new Error(ful2.error.message);
        fulfillments = ful2.data as unknown[] | null;
      } else {
        fulfillments = ful1.data as unknown[] | null;
      }
    }

    const activeCount = filtered.filter((o) => !HISTORY.has(o.status)).length;

    return {
      orders,
      items: (items ?? []) as unknown as Array<{
        order_id: string;
        item_name: string;
        quantity: number;
        unit_price_bs: number;
        subtotal_bs: number;
        discount_bs: number;
      }>,
      fulfillments: (fulfillments ?? []) as unknown as Array<{
        id: string;
        order_id: string;
        chef_id: string | null;
        status: string;
        subtotal_bs: number;
        discount_bs: number;
        total_bs: number;
        priority_tier: string | null;
        priority_label: string | null;
        priority_color: string | null;
        priority_price_bs: number;
        cancel_reason: string | null;
      }>,
      /** True when more than 40 chef-visible orders exist — deliver older ones to free slots. */
      capped: truncated || all.length >= 80,
      active_count: activeCount,
      shown_count: orders.length,
      max_shown: 40,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
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
    const { isAdmin } = await assertStaff(context);
    const { data, error } = await context.supabase
      .from("chef_discounts" as any)
      .select(
        "id,owner_id,name,code,discount_type,value,is_automatic,is_active,starts_at,ends_at,created_at,updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const names = isAdmin ? await usernameMap(context) : {};
    return {
      my_user_id: context.userId,
      is_admin: isAdmin,
      owner_names: names,
      discounts: (data ?? []) as unknown as Array<{
        id: string;
        owner_id: string;
        name: string;
        code: string | null;
        discount_type: "percentage" | "fixed";
        value: number;
        is_automatic: boolean;
        is_active: boolean;
        starts_at: string | null;
        ends_at: string | null;
      }>,
    };
  });

export const upsertDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => discountInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    if (data.discount_type === "percentage" && data.value > 100) throw new Error("Percentage cannot exceed 100");
    const payload = { ...data, code: data.is_automatic ? null : data.code?.toUpperCase(), owner_id: context.userId };
    if (data.id) {
      const { error } = await context.supabase
        .from("chef_discounts" as any)
        .update(payload)
        .eq("id", data.id)
        .eq("owner_id", context.userId);
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
    const { isAdmin } = await assertStaff(context);
    let query = context.supabase.from("chef_discounts" as any).delete().eq("id", data.id);
    if (!isAdmin) query = query.eq("owner_id", context.userId);
    const { error } = await query;
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
    const names = await usernameMap(context);
    return usersResp.users
      .map((u) => ({
        id: u.id,
        username: names[u.id] ?? (u.email ?? "").split("@")[0] ?? u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role),
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
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
  username: z.string().trim().min(2).max(48),
  password: z.string().min(6).max(200),
  role: z.enum(["admin", "chef"]),
});

/**
 * Staff accounts are created from a username, using the exact same
 * username -> credential rule the sign-in form uses, so a fresh account can
 * sign in immediately with what the admin typed.
 */
export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createStaffInput.parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");

    const normalized = normalizeStaffUsername(data.username);
    if (normalized.length < 2) {
      throw new Error("Username must have at least 2 letters or numbers");
    }
    const email = staffUsernameToEmail(data.username);
    const password = data.password;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Set password + email_confirm in one shot, then force the password again.
    // Staff list can show "active" from user_roles/staff_profiles while
    // auth.users still has no usable password — that is the "wrong password" bug.
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        staff_username: data.username.trim(),
        staff_username_normalized: normalized,
      },
    });
    if (error) {
      throw new Error(
        /already/i.test(error.message)
          ? `The username "${data.username.trim()}" is already taken`
          : error.message,
      );
    }
    const uid = created.user!.id;

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(uid, {
      password,
      email_confirm: true,
    });
    if (pwErr) throw new Error(pwErr.message);

    const { error: rerr } = await context.supabase
      .from("user_roles" as any)
      .upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });
    if (rerr) throw new Error(rerr.message);

    const { error: perr } = await context.supabase
      .from("staff_profiles" as any)
      .upsert(
        { user_id: uid, username: data.username.trim() },
        { onConflict: "user_id" },
      );
    if (perr) throw new Error(perr.message);

    return {
      id: uid,
      username: data.username.trim(),
      sign_in_username: normalized,
      sign_in_email: email,
    };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(6).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { isAdmin } = await assertStaff(context);
    if (!isAdmin) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- low stock alerts (DB table removed — empty client API) --------

export type StockAlert = {
  id: string;
  menu_item_id: string;
  owner_id: string | null;
  item_name: string;
  stock: number;
  threshold: number;
  created_at: string;
};

/** No stock_alerts table — derive low stock in UI from menu_items.stock if needed. */
export const listStockAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin } = await assertStaff(context);
    return {
      is_admin: isAdmin,
      my_user_id: context.userId,
      owner_names: {} as Record<string, string>,
      alerts: [] as StockAlert[],
    };
  });

export const dismissStockAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async () => ({ ok: true }));
/** Cancel one chef's portion of an order: rolls stock back and records the reason (server-side). */
export const cancelFulfillment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    const { error } = await context.supabase.rpc("cancel_fulfillment" as any, {
      _fulfillment_id: data.id,
      _reason: data.reason,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
