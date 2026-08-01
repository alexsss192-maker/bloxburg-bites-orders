// Discord REST helpers for verification. Bot token only.
const API = "https://discord.com/api/v10";

function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN missing");
  return { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
}

export type DiscordUser = { id: string; username: string; global_name: string | null; avatar: string | null };

/** Thrown when the configured guild is not visible to the bot (bad ID or bot not invited). */
export class GuildUnavailableError extends Error {
  constructor() {
    super("The Discord server is not reachable by our bot. Staff needs to check the server configuration.");
    this.name = "GuildUnavailableError";
  }
}

async function assertGuildReachable(guildId: string) {
  const res = await fetch(`${API}/guilds/${guildId}`, { headers: botHeaders() });
  if (res.status === 404 || res.status === 403) throw new GuildUnavailableError();
}

/** Resolve a Discord user by ID OR username lookup within our guild. */
export async function findGuildMember(usernameOrId: string): Promise<{ user: DiscordUser; inGuild: boolean } | null> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID missing");
  const trimmed = usernameOrId.trim().replace(/^@/, "");
  await assertGuildReachable(guildId);

  // If it's numeric-looking id, try direct member fetch
  if (/^\d{15,20}$/.test(trimmed)) {
    const res = await fetch(`${API}/guilds/${guildId}/members/${trimmed}`, { headers: botHeaders() });
    if (res.status === 200) {
      const data = (await res.json()) as { user: DiscordUser };
      return { user: data.user, inGuild: true };
    }
    if (res.status === 404) {
      // Not in guild, try fetch the raw user
      const u = await fetch(`${API}/users/${trimmed}`, { headers: botHeaders() });
      if (u.ok) return { user: (await u.json()) as DiscordUser, inGuild: false };
      return null;
    }
    return null;
  }

  // Search by username in guild
  const params = new URLSearchParams({ query: trimmed, limit: "5" });
  const res = await fetch(`${API}/guilds/${guildId}/members/search?${params.toString()}`, { headers: botHeaders() });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ user: DiscordUser }>;
  const lower = trimmed.toLowerCase();
  const match =
    arr.find((m) => m.user.username.toLowerCase() === lower) ??
    arr.find((m) => (m.user.global_name ?? "").toLowerCase() === lower) ??
    arr[0];
  if (!match) return null;
  return { user: match.user, inGuild: true };
}

export async function sendDm(discordId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  // Open DM channel
  const dm = await fetch(`${API}/users/@me/channels`, {
    method: "POST",
    headers: botHeaders(),
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!dm.ok) return { ok: false, error: `Cannot open DM (${dm.status})` };
  const { id: channelId } = (await dm.json()) as { id: string };
  const send = await fetch(`${API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: botHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!send.ok) {
    const body = await send.text();
    return { ok: false, error: `DM failed: ${send.status} ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

export function avatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

export function inviteUrl() {
  // Simple invite guidance - actual invite requires a persistent invite link from staff
  return `https://discord.com/channels/${process.env.DISCORD_GUILD_ID ?? ""}`;
}