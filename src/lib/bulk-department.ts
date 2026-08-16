/**
 * Bulk Department / Fast Service
 *
 * Bulk = 4 trays or more.
 * Each tray = 21 items → 84+ items is bulk-sized.
 *
 * Admins (house menu) are always bulk.
 * Other bulk chefs are listed in BULK_CHEF_USERNAMES.
 *
 * Bulk service pricing is NOT stored here.
 * It is stored server-side in Supabase and can only be
 * changed through Skippe by an eligible bulk chef.
 */

/** Information copy used in cart or kitchen view for bulk orders */
export const bulkKitchenInfoCopy =
  "This order has met the bulk criteria and will be sent to the fast service department.";

/** Extra bulk chefs (staff login usernames). Admins do NOT need to be listed. */
export const BULK_CHEF_USERNAMES: string[] = [
  // e.g. "fastservice"
];

export const ITEMS_PER_TRAY = 21;
export const BULK_TRAY_THRESHOLD = 4;
export const BULK_ITEM_THRESHOLD =
  ITEMS_PER_TRAY * BULK_TRAY_THRESHOLD;

export const BULK_VALUE_THRESHOLD = 50_000;

/**
 * Feature flag for the bulk department itself.
 *
 * Keep this false/true exactly as your existing project expects.
 */
export const BULK_SECTION_LIVE = false;

export const FAKE_NORMAL_MINUTES_PER_TRAY = 45;
export const FAKE_BULK_MINUTES_PER_TRAY = 12;

export function normalizeBulkUsername(
  username: string | null | undefined,
): string {
  return (username ?? "").trim().toLowerCase();
}

export function isBulkChefUsername(
  username: string | null | undefined,
): boolean {
  const normalized = normalizeBulkUsername(username);

  if (!normalized) return false;

  return BULK_CHEF_USERNAMES.some(
    (username) =>
      normalizeBulkUsername(username) === normalized,
  );
}

/**
 * Public kitchens:
 *
 * - House/admin menu = bulk
 * - Listed bulk chef = bulk
 */
export function isPublicBulkChef(chef: {
  username?: string | null;
  is_admin?: boolean | null;
}): boolean {
  if (chef.is_admin) return true;

  return isBulkChefUsername(chef.username);
}

export function traysFromCount(itemCount: number): number {
  if (itemCount <= 0) return 0;

  return Math.ceil(itemCount / ITEMS_PER_TRAY);
}

export function isBulkSizedOrder(
  itemCount: number,
  subtotalBs = 0,
): boolean {
  return (
    itemCount >= BULK_ITEM_THRESHOLD ||
    subtotalBs >= BULK_VALUE_THRESHOLD
  );
}

/** Determines if the cart items are mostly from a bulk kitchen */
export function cartIsMostlyBulkKitchen(items: any[] = []): boolean {
  if (!items || items.length === 0) return false;
  const bulkCount = items.filter(
    (item) => item?.is_bulk || item?.chef?.is_admin || isPublicBulkChef(item?.chef || {})
  ).length;
  return bulkCount >= items.length / 2;
}

export function estimateNormalMinutes(
  itemCount: number,
): number {
  return traysFromCount(itemCount) * FAKE_NORMAL_MINUTES_PER_TRAY;
}

export function estimateBulkMinutes(
  itemCount: number,
): number {
  return traysFromCount(itemCount) * FAKE_BULK_MINUTES_PER_TRAY;
}

/**
 * Warning copy shown to the customer when their cart hits bulk size.
 * Used by the cart drawer's bulk-confirmation dialog.
 */
export function bulkWarningCopy(itemCount: number): {
  title: string;
  body: string;
  trays: number;
  normalMinutes: number;
  bulkMinutes: number;
} {
  const trays = traysFromCount(itemCount);

  return {
    title: "This is a bulk order",
    body: "Bulk orders require special processing and cannot be modified once started. The kitchen will route this to the fast service department instead of the normal queue.",
    trays,
    normalMinutes: estimateNormalMinutes(itemCount),
    bulkMinutes: estimateBulkMinutes(itemCount),
  };
}
