import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/menu.functions";
import { syncDiscordStaffRoles } from "@/lib/staff-role-sync.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, ShoppingBag, Menu as MenuIcon, Users, Sparkles, ScrollText } from "lucide-react";

export const Route = createFileRoute("/staff")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Staff — Panda Bites" },
      { name: "description", content: "Panda Bites staff portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffLayout,
});

function StaffLayout() {
  const [session, setSession] = useState<null | { userId: string }>(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isChef, setIsChef] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);
  const getRoles = useServerFn(getMyRoles);
  const syncRoles = useServerFn(syncDiscordStaffRoles);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ? { userId: s.user.id } : null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { userId: data.session.user.id } : null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setRolesReady(false);
    syncRoles()
      .then(() => getRoles())
      .then((r) => {
        setIsAdmin(r.isAdmin);
        setIsChef(r.isChef);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Discord role check failed"))
      .finally(() => setRolesReady(true));
  }, [session, getRoles, syncRoles]);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    navigate({ to: "/staff", replace: true });
  }

  if (!ready) return <div className="grid min-h-screen place-items-center bg-cream text-ink/60">Loading...</div>;
  if (!session) return <StaffLogin />;
  if (!rolesReady) return <div className="grid min-h-screen place-items-center bg-cream text-ink/60">Checking Discord roles...</div>;
  if (!isAdmin && !isChef)
    return (
      <div className="grid min-h-screen place-items-center bg-cream p-6 text-center">
        <div>
          <p className="font-display text-3xl">No staff access</p>
          <p className="mt-2 text-muted-foreground">
            You're signed in, but your account doesn't have a staff role yet. Ask an admin to grant you one.
          </p>
          <button onClick={signOut} className="mt-4 rounded-full bg-ink px-5 py-2 text-cream">Sign out</button>
        </div>
      </div>
    );

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
            {(isAdmin || isChef) && (
              <>
                <Link to="/staff/menu" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><MenuIcon className="h-4 w-4" /> Menu</span>
                </Link>
                <Link to="/staff/panda" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Skippe</span>
                </Link>
                <Link to="/staff/audit" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><ScrollText className="h-4 w-4" /> Audit</span>
                </Link>
              </>
            )}
            {isAdmin && (
              <>
                <Link to="/staff/users" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> Users</span>
                </Link>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-cherry/20 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-widest text-cherry sm:inline">
              {isAdmin ? "Admin" : "Chef"}
            </span>
            <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 text-sm text-cream hover:bg-cream/20">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8"><Outlet /></main>
    </div>
  );
}

function StaffLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast.success("Signed in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-cream p-6">
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-3xl border border-border/60 bg-white p-8 shadow-xl"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Staff portal</p>
        <h1 className="font-display text-4xl">Welcome back, chef.</h1>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-2 h-12 rounded-xl" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-2 h-12 rounded-xl" />
        </div>
        <Button disabled={loading} type="submit" className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry">
          {loading ? "Signing in..." : "Sign in"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Staff-only. If you need access, ask an admin in the Panda Bites Discord.
        </p>
      </motion.form>
    </div>
  );
}