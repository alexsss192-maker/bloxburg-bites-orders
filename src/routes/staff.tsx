import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/menu.functions";
import { syncDiscordStaffRoles } from "@/lib/staff-role-sync.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BadgePercent, LogOut, ShoppingBag, Menu as MenuIcon, Users, Sparkles, ScrollText } from "lucide-react";

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
    setIsAdmin(false);
    setIsChef(false);
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
             Your verified Discord account does not currently have the Chef or Admin role in the server.
          </p>
          <Button onClick={signOut} className="mt-4 rounded-full bg-ink px-5 py-2 text-cream">Sign out</Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-border bg-ink text-cream">
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
                <Link to="/staff/discounts" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                  <span className="inline-flex items-center gap-1.5"><BadgePercent className="h-4 w-4" /> Discounts</span>
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
              <Link to="/staff/users" className="text-cream/80 hover:text-cream [&.active]:text-cherry">
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> Users</span>
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-cherry/20 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-widest text-cherry sm:inline">
              {isAdmin ? "Admin" : "Chef"}
            </span>
            <Button onClick={signOut} className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 text-sm text-cream hover:bg-cream/20">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8"><Outlet /></main>
    </div>
  );
}

function StaffLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: staffUsernameToEmail(username),
        password,
      });
      if (error) throw error;
      toast.success("Signed in");
    } catch (err) {
      toast.error(err instanceof Error ? "Wrong username or password" : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="pb-panel pb-rise grid w-full max-w-4xl overflow-hidden md:grid-cols-2">
        <div className="pb-accent-face flex flex-col justify-between p-10 md:p-12">
          <div aria-hidden className="pointer-events-none absolute -right-14 -top-14 h-64 w-64 rounded-full bg-cherry/40 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rotate-12 rounded-3xl border-4 border-blossom/25" />
          <div className="relative z-10">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.28em] text-blossom/80">The kitchen</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.05]">
              Chefs
              <br />
              only.
            </h1>
            <p className="mt-4 max-w-[280px] text-sm leading-relaxed text-blossom/90">
              Sign in to run the pass: incoming orders, your own menu, your own discounts, and Skippe.
            </p>
          </div>
          <p className="relative z-10 mt-10 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-blossom/75">
            Panda Bites · Staff portal
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col justify-center p-10 md:p-14">
          <h2 className="font-display text-3xl">Welcome back, chef.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Use the username and password an admin gave you.
          </p>

          <div className="mt-8 space-y-5">
            <div>
              <Label htmlFor="staff-username" className="pb-eyebrow">Username</Label>
              <Input
                id="staff-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                placeholder="e.g. Alex"
                className="mt-3 h-13 rounded-2xl border-border bg-background px-5 py-4"
              />
            </div>
            <div>
              <Label htmlFor="staff-password" className="pb-eyebrow">Password</Label>
              <Input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="mt-3 h-13 rounded-2xl border-border bg-background px-5 py-4"
              />
            </div>
          </div>

          <Button
            disabled={loading}
            type="submit"
            className="pb-press mt-8 w-full rounded-2xl bg-accent py-6 text-base font-bold text-accent-foreground hover:bg-sakura"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="mt-6 text-xs text-muted-foreground">
            Staff-only. If you need access, ask an admin in the Panda Bites Discord.
          </p>
        </form>
      </div>
    </div>
  );
}
