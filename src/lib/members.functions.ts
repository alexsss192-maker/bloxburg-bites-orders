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

export type MemberReward = {
  id: string;
  milestone: number;
  kind: "discount" | "priority" | "pickup" | "role" | "giveaway" | "bs_payout" | "expired_claim";
  label: string;
  value: number;
  uses_remaining: number;
  seen_at: string | null;
  created_at: string;
};

export type MemberProfile = {
  member_id: string;
  username: string;
  avatar_url: string | null;
  delivered_count: number;
  giveaway_entries: number;
  roles: string[];
  rewards: MemberReward[];
  bs_owed: number;
  bs_paid: number;
  bs_spent_priority: number;
  bs_spent_orders: number;
  pickup_hours: number;
  priority_tier: "low" | "mid" | "high" | null;
};

const usernameInput = z.object({ username: z.string().trim().min(2).max(64) });

export const getMemberProfile = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => usernameInput.parse(d))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase.rpc("get_member_profile" as never, {
      _username: data.username,
    } as never);
    if (error) throw new Error(error.message);
    const first = (Array.isArray(rows) ? rows[0] : rows) as unknown as MemberProfile | undefined;
    return first ?? null;
  });

export type UnseenRewardGroup = {
  milestone: number;
  rewards: Array<{ kind: string; label: string; value: number }>;
};

export const getUnseenRewards = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => usernameInput.parse(d))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase.rpc("get_unseen_member_rewards" as never, {
      _username: data.username,
    } as never);
    if (error) return [] as UnseenRewardGroup[];
    return (rows ?? []) as unknown as UnseenRewardGroup[];
  });

export const ackRewards = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    usernameInput.extend({ milestone: z.number().int().min(1).max(5) }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { error } = await supabase.rpc("ack_member_rewards" as never, {
      _username: data.username,
      _milestone: data.milestone,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ClaimableDiscount = {
  id: string;
  chef_username: string;
  name: string;
  code: string | null;
  discount_type: "percentage" | "fixed";
  value: number;
  ended_at: string | null;
  claimed: boolean;
  claims_left: number;
};

export const listClaimableExpired = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => usernameInput.parse(d))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase.rpc("list_claimable_expired_discounts" as never, {
      _username: data.username,
    } as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ClaimableDiscount[];
  });

export const claimExpiredDiscount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => usernameInput.extend({ discount_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: code, error } = await supabase.rpc("claim_expired_discount" as never, {
      _username: data.username,
      _discount_id: data.discount_id,
    } as never);
    if (error) throw new Error(error.message);
    return { code: (code as unknown as string) ?? null };
  });

// -------- priority (public read + chef management) --------

export type PriorityLevel = {
  owner_id: string;
  chef_username: string;
  is_admin: boolean;
  tier: "low" | "mid" | "high";
  name: string;
  price_bs: number;
  color: string;
};

export const getPriorityLevels = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverPublicClient();

  // Only active rows are returned. A tier appears at checkout only after the chef
  // has saved it (Staff → Priority). The staff page now auto-seeds any missing
  // low/mid/high on first visit so all three tiers show by default.
  // (RPC get_priority_levels is kept as fallback.)
  const { data: rows, error } = await supabase
    .from("chef_priority_levels" as never)
    .select("owner_id, tier, name, price_bs, color")
    .eq("is_active", true);

  if (!error && rows && (rows as unknown[]).length > 0) {
    const list = rows as unknown as Array<{
      owner_id: string;
      tier: string;
      name: string;
      price_bs: number;
      color: string;
    }>;

    const ownerIds = Array.from(new Set(list.map((r) => r.owner_id)));
    const { data: profiles } = await supabase
      .from("staff_profiles" as never)
      .select("user_id, username")
      .in("user_id", ownerIds);

    const nameByOwner = new Map<string, string>();
    for (const p of (profiles ?? []) as unknown as Array<{ user_id: string; username: string }>) {
      nameByOwner.set(p.user_id, p.username);
    }

    const rank: Record<string, number> = { low: 0, mid: 1, high: 2 };
    return list
      .map((r) => ({
        owner_id: r.owner_id,
        chef_username: nameByOwner.get(r.owner_id) || "Chef",
        is_admin: false,
        tier: r.tier as PriorityLevel["tier"],
        name: r.name,
        price_bs: r.price_bs,
        color: r.color,
      }))
      .sort(
        (a, b) =>
          a.owner_id.localeCompare(b.owner_id) ||
          (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9),
      );
  }

  const { data, error: rpcError } = await supabase.rpc("get_priority_levels" as never);
  if (rpcError) throw new Error(rpcError.message || error?.message || "Could not load priority levels");
  return (data ?? []) as unknown as PriorityLevel[];
});

/** Which kitchens are in this basket, so checkout can offer their priority levels. */
export const getCartChefs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ menu_item_ids: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase
      .from("menu_items" as never)
      .select("owner_id")
      .in("id", data.menu_item_ids);
    if (error) throw new Error(error.message);
    const owners = new Set<string>();
    for (const row of (rows ?? []) as unknown as Array<{ owner_id: string | null }>) {
      if (row.owner_id) owners.add(row.owner_id);
    }
    return Array.from(owners);
  });

export const listMyPriorityLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("chef_priority_levels" as never)
      .select("id,tier,name,price_bs,color,is_active")
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string;
      tier: "low" | "mid" | "high";
      name: string;
      price_bs: number;
      color: string;
      is_active: boolean;
    }>;
  });

export const upsertPriorityLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tier: z.enum(["low", "mid", "high"]),
        name: z.string().trim().min(1).max(40),
        price_bs: z.number().int().min(0).max(100000000),
        color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
        is_active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("chef_priority_levels" as never)
      .upsert({ ...data, owner_id: context.userId } as never, { onConflict: "owner_id,tier" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type StaffMember = {
  id: string;
  username: string;
  delivered_count: number;
  giveaway_entries: number;
  roles: string[];
  rewards: MemberReward[];
};

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Hard cap: top 50 by deliveries. Rewards only for those rows (not the whole table).
    const { data: members, error } = await context.supabase
      .from("members" as never)
      .select("id,username,delivered_count,giveaway_entries,roles")
      .order("delivered_count", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const list = (members ?? []) as unknown as Array<Omit<StaffMember, "rewards">>;
    const ids = list.map((m) => m.id);
    if (ids.length === 0) {
      return [] as StaffMember[];
    }
    const { data: rewards } = await context.supabase
      .from("member_rewards" as never)
      .select("id,member_id,milestone,kind,label,value,uses_remaining,seen_at,created_at")
      .in("member_id", ids);
    const byMember = new Map<string, MemberReward[]>();
    for (const r of (rewards ?? []) as unknown as Array<MemberReward & { member_id: string }>) {
      const arr = byMember.get(r.member_id) ?? [];
      arr.push(r);
      byMember.set(r.member_id, arr);
    }
    return list.map((m) => ({ ...m, rewards: byMember.get(m.id) ?? [] })) as StaffMember[];
  });

export const markBsPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reward_id: z.string().uuid(), paid: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("mark_bs_payout_paid" as never, {
      _reward_id: data.reward_id,
      _paid: data.paid,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
