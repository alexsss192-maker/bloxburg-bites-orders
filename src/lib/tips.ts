/**
 * Tip jar — no database.
 * Site-wide presets live in code + optional localStorage override (staff UI).
 * Chosen tip is appended to the order note at checkout (no extra tables/columns).
 */

export type TipType = "percentage" | "fixed";

export type TipOption = {
  /** Stable id for UI selection (not a DB uuid). */
  id: string;
  sort_order: 1 | 2 | 3;
  label: string;
  tip_type: TipType;
  tip_value: number;
  is_active: boolean;
};

const STORAGE_KEY = "pb_tip_jar_v1";

/** Built-in defaults — change these to update the site-wide tip jar. */
export const DEFAULT_TIP_OPTIONS: TipOption[] = [
  {
    id: "tip-1",
    sort_order: 1,
    label: "Kind",
    tip_type: "percentage",
    tip_value: 10,
    is_active: true,
  },
  {
    id: "tip-2",
    sort_order: 2,
    label: "Generous",
    tip_type: "percentage",
    tip_value: 15,
    is_active: true,
  },
  {
    id: "tip-3",
    sort_order: 3,
    label: "Legend",
    tip_type: "fixed",
    tip_value: 5000,
    is_active: true,
  },
];

export function computeTipBs(
  tipType: TipType,
  tipValue: number,
  baseBs: number,
): number {
  const base = Math.max(0, Math.floor(Number(baseBs) || 0));
  const value = Math.max(0, Math.floor(Number(tipValue) || 0));
  if (tipType === "fixed") return value;
  return Math.round((base * Math.min(100, value)) / 100);
}

export function formatTipOption(opt: Pick<TipOption, "label" | "tip_type" | "tip_value">): string {
  const custom = (opt.label ?? "").trim();
  if (custom) {
    if (opt.tip_type === "percentage") return `${custom} (${opt.tip_value}%)`;
    return `${custom} (B$${Number(opt.tip_value).toLocaleString()})`;
  }
  if (opt.tip_type === "percentage") return `${opt.tip_value}%`;
  return `B$${Number(opt.tip_value).toLocaleString()}`;
}

function normalize(raw: unknown): TipOption[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_TIP_OPTIONS.map((d) => ({ ...d }));
  }
  const byOrder = new Map<number, TipOption>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sort = Number(o.sort_order);
    if (sort !== 1 && sort !== 2 && sort !== 3) continue;
    const tip_type = o.tip_type === "fixed" ? "fixed" : "percentage";
    let tip_value = Math.max(0, Math.floor(Number(o.tip_value) || 0));
    if (tip_type === "percentage") tip_value = Math.min(100, tip_value);
    byOrder.set(sort, {
      id: typeof o.id === "string" && o.id ? o.id : `tip-${sort}`,
      sort_order: sort as 1 | 2 | 3,
      label: String(o.label ?? "").slice(0, 40),
      tip_type,
      tip_value,
      is_active: o.is_active !== false,
    });
  }
  return ([1, 2, 3] as const).map(
    (n) => byOrder.get(n) ?? { ...DEFAULT_TIP_OPTIONS[n - 1] },
  );
}

/** Load tip presets (localStorage override → code defaults). Safe on SSR. */
export function loadTipOptions(): TipOption[] {
  if (typeof window === "undefined") {
    return DEFAULT_TIP_OPTIONS.map((d) => ({ ...d }));
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TIP_OPTIONS.map((d) => ({ ...d }));
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_TIP_OPTIONS.map((d) => ({ ...d }));
  }
}

/** Persist tip presets for this browser (staff Tip jar page). */
export function saveTipOptions(options: TipOption[]): TipOption[] {
  const normalized = normalize(options);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* quota / private mode */
    }
  }
  return normalized;
}

export function activeTipOptions(options?: TipOption[]): TipOption[] {
  return (options ?? loadTipOptions()).filter((o) => o.is_active);
}
