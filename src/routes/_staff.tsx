import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Menu, ShoppingBag, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/menu.functions";

export const Route = createFileRoute("/_staff")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/staff" });
  },
  component: StaffLayout,
});

function StaffLayout() {
  const navigate = useNavigate();
  const getRoles = useServerFn(getMyRoles);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getRoles()
      .then((r) => {
        if (!r.isAdmin && !r.isChef) {
          navigate({ to: "/staff" });
          return;
        }
        setIsAdmin(r.isAdmin);
        setReady(true);
      })
      .catch(() => navigate({ to: "/staff" }));
  }, [getRoles, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/staff", replace: true });
  }

  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-cream text-ink/60">Loading staff portal...</div>;
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-border/60 bg-ink text-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-cherry text-cream">🐼</span>
            <span className="font-display text-2xl">Panda Bites · Staff</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <Link to="/staff/orders" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
              <span className="inline-flex items-center gap-1.5"><ShoppingBag className="h-4 w-4" /> Orders</span>
            </Link>
            {isAdmin && (
              <>
                <Link to="/staff/menu" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><Menu className="h-4 w-4" /> Menu</span>
                </Link>
                <Link to="/staff/users" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> Users</span>
                </Link>
              </>
            )}
          </nav>
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 text-sm text-cream hover:bg-cream/20">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8"><Outlet /></main>
    </div>
  );
}