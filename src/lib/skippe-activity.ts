/**
 * Skippe live activity labels — zero LLM credits, zero database.
 * Pure string matching on the chef's message + tool names from the server.
 */

export type SkippeActivity = {
  id: string;
  label: string;
  emoji?: string;
};

/** Map known tools → human status (shown while / after work). */
const TOOL_LABELS: Record<string, { label: string; emoji: string }> = {
  list_menu_items: { label: "Skippe is reading your menu", emoji: "📖" },
  create_menu_item: { label: "Skippe is adding a menu item", emoji: "✨" },
  update_menu_item: { label: "Skippe is editing your menu", emoji: "🪄" },
  delete_menu_item: { label: "Skippe is removing a menu item", emoji: "🧹" },
  list_discounts: { label: "Skippe is checking your discounts", emoji: "🏷️" },
  create_discount: { label: "Skippe is creating a discount", emoji: "🧁" },
  update_discount: { label: "Skippe is updating a discount", emoji: "✏️" },
  end_discount: { label: "Skippe is ending a discount", emoji: "🚪" },
  list_priority_levels: { label: "Skippe is reading priority tiers", emoji: "⚡" },
  upsert_priority_level: { label: "Skippe is setting priority price & color", emoji: "🎨" },
  delete_priority_level: { label: "Skippe is removing priority tiers", emoji: "💨" },
  list_orders: { label: "Skippe is checking kitchen orders", emoji: "📋" },
  update_order_status: { label: "Skippe is updating an order", emoji: "🚀" },
  set_bulk_service_fee: { label: "Skippe is setting bulk / fast service fee", emoji: "📦" },
  get_bulk_service_fee: { label: "Skippe is reading bulk fee", emoji: "💰" },
};

/**
 * Guess activity steps from the user message alone (before any server response).
 * Used for the live status while the request is in flight — no LLM credits.
 */
export function activitiesFromMessage(
  message: string,
  imageCount = 0,
): SkippeActivity[] {
  const msg = (message || "").toLowerCase();
  const out: SkippeActivity[] = [];
  const add = (id: string, label: string, emoji = "💭") => {
    if (!out.some((a) => a.id === id)) out.push({ id, label, emoji });
  };

  if (imageCount > 0) {
    add("vision", "Skippe is looking at your photos", "👀");
  }

  if (/\bpriorit|\bpriort|\b(low|mid|high)\s+(tier|level|to|at)\b/.test(msg)) {
    if (/\b(list|show|see|what|current)\b/.test(msg)) {
      add("priority_list", "Skippe is reading priority tiers", "⚡");
    } else if (/\b(delete|remove|clear)\b/.test(msg)) {
      add("priority_del", "Skippe is removing priority tiers", "💨");
    } else {
      add("priority_set", "Skippe is setting priority price & color", "🎨");
    }
  }

  if (
    /\bdiscount/.test(msg) ||
    (/\b(auto|automatic)\b/.test(msg) && /\b(%|percent|off)\b/.test(msg))
  ) {
    if (/\b(list|show)\b/.test(msg))
      add("discount_list", "Skippe is checking your discounts", "🏷️");
    else if (/\b(end|remove|delete|stop)\b/.test(msg))
      add("discount_end", "Skippe is ending a discount", "🚪");
    else add("discount_create", "Skippe is creating a discount", "🧁");
  }

  if (
    /\b(menu|item|dish|stock|restock|fridge)\b/.test(msg) ||
    (/\b(add|create|make|new)\b/.test(msg) &&
      /\b(item|dish|food|menu)\b/.test(msg))
  ) {
    if (/\b(list|show|see|what.*(menu|item))\b/.test(msg)) {
      add("menu_list", "Skippe is reading your menu", "📖");
    } else if (/\b(delete|remove)\b/.test(msg)) {
      add("menu_del", "Skippe is removing a menu item", "🧹");
    } else if (/\b(stock|restock|qty|quantity)\b/.test(msg)) {
      add("menu_stock", "Skippe is updating stock", "📦");
    } else if (/\b(add|create|make|new)\b/.test(msg)) {
      add("menu_add", "Skippe is adding a menu item", "✨");
    } else {
      add("menu_edit", "Skippe is editing your menu", "🪄");
    }
  }

  if (/\border/.test(msg)) {
    if (/\b(list|show|pending|queue)\b/.test(msg)) {
      add("orders", "Skippe is checking kitchen orders", "📋");
    } else {
      add("order_update", "Skippe is updating an order", "🚀");
    }
  }

  if (/\bbulk\b/.test(msg) && /\b(fee|service)\b/.test(msg)) {
    add("bulk", "Skippe is handling bulk / fast service fee", "📦");
  }

  if (out.length === 0) {
    if (imageCount > 0) add("scan", "Skippe is working through your scan", "🔍");
    else add("think", "Skippe is on it", "💭");
  }

  // One soft follow-up beat so the status can rotate without looking busy
  if (out.length === 1) {
    add("almost", "Skippe is almost ready…", "✨");
  }

  return out;
}

/** After tools finish — labels from real tool names only (still no LLM). */
export function activitiesFromRuns(
  runs: Array<{ name?: string; tool?: string; ok?: boolean }>,
): SkippeActivity[] {
  const out: SkippeActivity[] = [];
  for (const r of runs) {
    const name = String(r.name || r.tool || "");
    const entry = TOOL_LABELS[name];
    if (entry && !out.some((a) => a.id === name)) {
      out.push({ id: name, label: entry.label, emoji: entry.emoji });
    }
  }
  return out;
}

export function activitiesFromMessageAndRuns(
  message: string,
  imageCount: number,
  runs?: Array<{ name?: string; tool?: string }>,
): SkippeActivity[] {
  const fromRuns = runs?.length ? activitiesFromRuns(runs) : [];
  if (fromRuns.length) return fromRuns;
  return activitiesFromMessage(message, imageCount);
}
