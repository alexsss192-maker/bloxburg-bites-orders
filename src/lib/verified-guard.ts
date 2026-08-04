import { redirect } from "@tanstack/react-router";

import { getVerifiedSession } from "@/lib/verify.functions";

export type VerifiedVisitor = {
  discord_id: string;
  username: string;
  avatar_url: string | null;
};

/**
 * Server-authoritative gate. Runs in `beforeLoad`, so the signed cookie is
 * validated on the server before any protected UI renders — during SSR from the
 * request headers, and during client navigation over the server-function RPC
 * (same-origin, so the cookie rides along).
 */
export async function requireVerified(): Promise<{ verified: VerifiedVisitor }> {
  const verified = await getVerifiedSession();
  if (!verified) throw redirect({ to: "/verify", replace: true });
  return { verified };
}

/** Used by /verify so an already-verified visitor never sees the gate again. */
export async function redirectVerifiedHome(): Promise<void> {
  const verified = await getVerifiedSession();
  if (verified) throw redirect({ to: "/", replace: true });
}