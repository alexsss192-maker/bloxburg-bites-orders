import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getVerifiedSession } from "@/lib/verify.functions";
import { motion } from "framer-motion";

const EXEMPT_PREFIXES = ["/verify", "/staff", "/api", "/lovable"];

export function VerifyGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const getSession = useServerFn(getVerifiedSession);
  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<{ discord_id: string; username: string; avatar_url: string | null } | null>(null);

  const exempt = EXEMPT_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));

  useEffect(() => {
    let cancelled = false;
    getSession()
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
  }, [location.pathname, exempt, getSession, navigate]);

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
  const getSession = useServerFn(getVerifiedSession);
  const [session, setSession] = useState<{ discord_id: string; username: string; avatar_url: string | null } | null>(null);
  useEffect(() => {
    getSession().then(setSession).catch(() => {});
  }, [getSession]);
  return session;
}