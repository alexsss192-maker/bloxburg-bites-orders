/**
 * Client-side caches — zero database.
 * sessionStorage: short-lived public catalog (menu/chefs/discounts/roles)
 * localStorage: reward "seen" acks, tip prefs, etc.
 */

const PREFIX = "pb_cache_";

function ss(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type Entry<T> = { v: T; exp: number };

export function cacheGet<T>(key: string): T | null {
  const store = ss();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) {
      store.removeItem(PREFIX + key);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const store = ss();
  if (!store) return;
  try {
    const entry: Entry<T> = { v: value, exp: Date.now() + ttlMs };
    store.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota — ignore */
  }
}

export function cacheDel(key: string): void {
  ss()?.removeItem(PREFIX + key);
}

/** Public catalog TTLs */
export const TTL_MENU = 60_000; // 1 min
export const TTL_CHEFS = 120_000;
export const TTL_DISCOUNTS = 60_000;
export const TTL_ROLES = 15 * 60_000; // 15 min

const SEEN_REWARDS_KEY = "pb_seen_reward_milestones_v1";

export function getSeenRewardMilestones(username: string): number[] {
  const store = ls();
  if (!store) return [];
  try {
    const all = JSON.parse(store.getItem(SEEN_REWARDS_KEY) ?? "{}") as Record<
      string,
      number[]
    >;
    return all[username.toLowerCase()] ?? [];
  } catch {
    return [];
  }
}

export function ackRewardMilestoneLocal(username: string, milestone: number): void {
  const store = ls();
  if (!store) return;
  try {
    const all = JSON.parse(store.getItem(SEEN_REWARDS_KEY) ?? "{}") as Record<
      string,
      number[]
    >;
    const k = username.toLowerCase();
    const set = new Set(all[k] ?? []);
    set.add(milestone);
    all[k] = Array.from(set);
    store.setItem(SEEN_REWARDS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

const CLAIMED_EXPIRED_KEY = "pb_claimed_expired_discounts_v1";

export function getClaimedExpiredIds(username: string): string[] {
  const store = ls();
  if (!store) return [];
  try {
    const all = JSON.parse(store.getItem(CLAIMED_EXPIRED_KEY) ?? "{}") as Record<
      string,
      string[]
    >;
    return all[username.toLowerCase()] ?? [];
  } catch {
    return [];
  }
}

export function markExpiredClaimedLocal(username: string, discountId: string): void {
  const store = ls();
  if (!store) return;
  try {
    const all = JSON.parse(store.getItem(CLAIMED_EXPIRED_KEY) ?? "{}") as Record<
      string,
      string[]
    >;
    const k = username.toLowerCase();
    const set = new Set(all[k] ?? []);
    set.add(discountId);
    all[k] = Array.from(set);
    store.setItem(CLAIMED_EXPIRED_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
