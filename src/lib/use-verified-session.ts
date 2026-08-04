import { useEffect, useState } from "react";

import type { VerifiedVisitor } from "@/lib/verified-guard";

/**
 * Presentational only — route access is gated on the server in `beforeLoad`.
 * Used by the header to show who is signed in.
 */
export function useVerifiedSession() {
  const [session, setSession] = useState<VerifiedVisitor | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/verify/session", { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<VerifiedVisitor | null>) : null))
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}