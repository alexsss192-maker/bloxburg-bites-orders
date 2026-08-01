import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";

const EXEMPT_PREFIXES = ["/verify", "/staff", "/api", "/lovable"];

export function VerifyGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<{ discord_id: string; username: string; avatar_url: string | null } | null>(null);

  const exempt = EXEMPT_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/verify/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Verification check failed");
        return response.json() as Promise<{ discord_id: string; username: string; avatar_url: string | null } | null>;
      })
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setChecked(true);
        if (!s && !exempt) navigate({ to: "/verify", replace: true });
      })
      .catch(() => setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [location.pathname, exempt, navigate]);

  if (exempt) return <>{children}</>;

  if (!checked) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream">
        <motion.div
          className="text-4xl"
          animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          🐼
        </motion.div>
      </div>
    );
  }

  if (!session) {
    // navigate is happening; render nothing
    return null;
  }

  return <>{children}</>;
}

export function useVerifiedSession() {
  const [session, setSession] = useState<{ discord_id: string; username: string; avatar_url: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/public/verify/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then(setSession)
      .catch(() => {});
  }, []);
  return session;
}