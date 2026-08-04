/**
 * Staff sign in with a username only. Supabase Auth requires an email, so the
 * username is normalized into a deterministic internal address. Password reset
 * by email is intentionally not available for these accounts.
 */
export const STAFF_EMAIL_DOMAIN = "pandabites.local";

export function normalizeStaffUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

export function staffUsernameToEmail(username: string): string {
  const normalized = normalizeStaffUsername(username);
  return `${normalized}@${STAFF_EMAIL_DOMAIN}`;
}