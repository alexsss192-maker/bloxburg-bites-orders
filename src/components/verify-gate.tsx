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
    
    fetch("/api/public/verify/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Verification session check failed");
        return (await response.json()) as { discord_id: string; username: string; avatar_url: string | null } | null;
      })
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setChecked(true);
        
        if (!s && !exempt) {
          // Not verified and trying to access a protected route
          navigate({ to: "/verify", replace: true });
        } else if (s && location.pathname === "/verify") {
          // Already verified and trying to access the verify page
          navigate({ to: "/", replace: true });
        }
      })
      .catch((err) => {
        console.error("Session check failed:", err);
        if (!cancelled) setChecked(true);
      });
      
    return () => {
      cancelled = true;
    };
  }, [location.pathname, exempt, navigate]);

  // If we are on an exempt route, we still want to show it immediately
  // while the background check might redirect us away if we are already verified (for /verify)
  if (exempt) {
    // Special case: if we are on /verify but already confirmed we have a session, 
    // we let the useEffect handle the navigation, but we don't need to block rendering.
    return <>{children}</>;
  }

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
    // If not checked, we showed the loader. If checked and no session, navigate happened.
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
