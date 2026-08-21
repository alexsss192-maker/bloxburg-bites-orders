/**
 * Discord helpers — user identity only.
 * No guild verification, no role sync, no membership checks.
 * Members type their Discord username at checkout; we only format/display it.
 */

export type DiscordUserInfo = {
  /** Raw username the member typed (not verified against Discord API). */
  username: string;
};

/** Normalize a typed Discord username for notes / history (no API call). */
export function normalizeDiscordUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").slice(0, 64);
}

export function isPlausibleDiscordUsername(raw: string): boolean {
  const u = normalizeDiscordUsername(raw);
  // Discord usernames: 2–32 chars historically; allow a bit more for display names
  return u.length >= 2 && u.length <= 64 && !/\s{2,}/.test(u);
}

/** Optional CDN avatar helper if you already have a snowflake + hash (no fetch). */
export function avatarUrlFromHash(
  userId: string,
  avatarHash: string | null | undefined,
): string | null {
  if (!userId || !avatarHash) return null;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
}
