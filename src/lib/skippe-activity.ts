/**
 * Skippe live activity labels — zero LLM credits, zero database.
 * Pure string matching on the chef's message + tool names from the server.
 */

export type SkippeActivity = {
  id: string;
  label: string;
};

/** Map known tools → human status (shown while / after work). */
const TOOL_LABELS: Record<string, string> = {
  list_menu_items: "Skippe is reading your menu",
  create_menu_item: "Skippe is adding a menu item",
  update_menu_item: "Skippe is editing your menu",
  delete_menu_item: "Skippe is removing a menu item",
  list_discounts: "Skippe is checking your discounts",
  create_discount: "Skippe is creating a discount",
  update_discount: "Skippe is updating a discount",
  end_discount: "Skippe is ending a discount",
  list_priority_levels: "Skippe is reading priority tiers",
  upsert_priority_level: "Skippe is setting priority price, name & color",
  delete_priority_level: "Skippe is removing priority tiers",
  list_orders: "Skippe is checking kitchen orders",
  update_order_status: "Skippe is updating an order",
  set_bulk_service_fee: "Skippe is setting bulk / fast service fee",
  get_bulk_service_fee: "Skippe is reading bulk / fast service fee",
};

/**
 * Guess activity steps from the user message alone (before any server response).
 * Used for the live “shiny” status while the request is in flight.
 */
export function activitiesFromMessage(
  message: string,
  imageCount = 0,
): SkippeActivity[] {
  const msg = (message || "").toLowerCase();
  const out: SkippeActivity[] = [];
  const add = (id: string, label: string) => {
    if (!out.some((a) => a.id === id)) out.push({ id, label });
  };

  if (imageCount > 0) {
    add("vision", "Skippe is looking at your photos");
  }

  if (/\bpriorit|\bpriort|\b(low|mid|high)\s+(tier|level|to|at)\b/.test(msg)) {
    if (/\b(list|show|see|what|current)\b/.test(msg)) {
      add("priority_list", "Skippe is reading priority tiers");
    } else if (/\b(delete|remove|clear)\b/.test(msg)) {
      add("priority_del", "Skippe is removing priority tiers");
    } else {
      add("priority_set", "Skippe is setting priority price, name & color");
    }
  }

  if (/\bdiscount/.test(msg) || (/\b(auto|automatic)\b/.test(msg) && /\b(%|percent|off)\b/.test(msg))) {
    if (/\b(list|show)\b/.test(msg)) add("discount_list", "Skippe is checking your discounts");
    else if (/\b(end|remove|delete|stop)\b/.test(msg)) add("discount_end", "Skippe is ending a discount");
    else add("discount_create", "Skippe is creating a discount");
  }

  if (
    /\b(menu|item|dish|stock|restock|fridge)\b/.test(msg) ||
    /\b(add|create|make|new)\b/.test(msg) && /\b(item|dish|food|menu)\b/.test(msg)
  ) {
    if (/\b(list|show|see|what.*(menu|item))\b/.test(msg)) {
      add("menu_list", "Skippe is reading your menu");
    } else if (/\b(delete|remove)\b/.test(msg)) {
      add("menu_del", "Skippe is removing a menu item");
    } else if (/\b(stock|restock|qty|quantity)\b/.test(msg)) {
      add("menu_stock", "Skippe is updating stock");
    } else if (/\b(add|create|make|new)\b/.test(msg)) {
      add("menu_add", "Skippe is adding a menu item");
    } else {
      add("menu_edit", "Skippe is editing your menu");
    }
  }

  if (/\border/.test(msg)) {
    if (/\b(list|show|pending|queue)\b/.test(msg)) {
      add("orders", "Skippe is checking kitchen orders");
    } else {
      add("order_update", "Skippe is updating an order");
    }
  }

  if (/\bbulk\b/.test(msg) && /\b(fee|service)\b/.test(msg)) {
    add("bulk", "Skippe is handling bulk / fast service fee");
  }

  if (out.length === 0) {
    if (imageCount > 0) add("scan", "Skippe is working through your scan");
    else add("think", "Skippe is on it");
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
    const label = TOOL_LABELS[name];
    if (label && !out.some((a) => a.id === name)) {
      out.push({ id: name, label });
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
