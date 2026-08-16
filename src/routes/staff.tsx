import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { staffUsernameToEmail } from "@/lib/staff-username";
import { getMyRoles } from "@/lib/menu.functions";
import { syncDiscordStaffRoles } from "@/lib/staff-role-sync.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import pandaMascot from "@/assets/panda-mascot.png";

import {
  BadgePercent,
  ClipboardList,
  LogOut,
  Menu as MenuIcon,
  Moon,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
  Zap,
  ShoppingBag,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  CircleCheck,
} from "lucide-react";

export const Route = createFileRoute("/staff")({
  ssr: false,

  head: () => ({
    meta: [
      { title: "Staff — Panda Bites" },
      {
        name: "description",
        content: "Panda Bites staff portal.",
      },
      {
        name: "robots",
        content: "noindex",
      },
    ],
  }),

  component: StaffLayout,
});

type NavItem = {
  to:
    | "/staff/orders"
    | "/staff/menu"
    | "/staff/discounts"
    | "/staff/priority"
    | "/staff/panda"
    | "/staff/audit"
    | "/staff/users";

  label: string;
  icon: typeof ShoppingBag;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    to: "/staff/orders",
    label: "Orders",
    icon: ShoppingBag,
  },
  {
    to: "/staff/menu",
    label: "Menu",
    icon: MenuIcon,
  },
  {
    to: "/staff/discounts",
    label: "Discounts",
    icon: BadgePercent,
  },
  {
    to: "/staff/priority",
    label: "Priority",
    icon: Zap,
  },
  {
    to: "/staff/panda",
    label: "Skippe",
    icon: Sparkles,
  },
  {
    to: "/staff/audit",
    label: "Audit Log",
    icon: ScrollText,
  },
  {
    to: "/staff/users",
    label: "Users",
    icon: Users,
    adminOnly: true,
  },
];

function StaffLayout() {
  const [session, setSession] = useState<null | { userId: string }>(
    null,
  );

  const [ready, setReady] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isChef, setIsChef] = useState(false);
  const [isBulkChef, setIsBulkChef] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const getRoles = useServerFn(getMyRoles);
  const syncRoles = useServerFn(syncDiscordStaffRoles);

  const navigate = useNavigate();
  const location = useLocation();

  /* ============================================================
     THEME
  ============================================================ */

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem("panda-staff-theme");

    if (savedTheme === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  /* ============================================================
     AUTH
  ============================================================ */

  useEffect(() => {
    const { data: subscription } =
      supabase.auth.onAuthStateChange(
        (_event, currentSession) => {
          setSession(
            currentSession
              ? {
                  userId: currentSession.user.id,
                }
              : null,
          );
        },
      );

    supabase.auth.getSession().then(({ data }) => {
      setSession(
        data.session
          ? {
              userId: data.session.user.id,
            }
          : null,
      );

      setReady(true);
    });

    return () =>
      subscription.subscription.unsubscribe();
  }, []);

  /* ============================================================
     STAFF ROLES
  ============================================================ */

  useEffect(() => {
    if (!session) {
      setRolesReady(false);
      return;
    }

    let cancelled = false;

    async function loadRoles() {
      setRolesReady(false);

      try {
        await syncRoles();

        const roles = await getRoles();

        if (cancelled) return;

        setIsAdmin(Boolean(roles.isAdmin));
        setIsChef(Boolean(roles.isChef));
        setIsBulkChef(Boolean(roles.isBulkChef));
      } catch (error) {
        if (cancelled) return;

        setIsAdmin(false);
        setIsChef(false);
        setIsBulkChef(false);

        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to verify staff role",
        );
      } finally {
        if (!cancelled) {
          setRolesReady(true);
        }
      }
    }

    loadRoles();

    return () => {
      cancelled = true;
    };
  }, [session, getRoles, syncRoles]);

  /* ============================================================
     ACTIONS
  ============================================================ */

  async function signOut() {
    await supabase.auth.signOut();

    setSession(null);

    navigate({
      to: "/staff",
      replace: true,
    });
  }

  function toggleTheme() {
    const next = !darkMode;

    setDarkMode(next);

    document.documentElement.classList.toggle(
      "dark",
      next,
    );

    window.localStorage.setItem(
      "panda-staff-theme",
      next ? "dark" : "light",
    );
  }

  /* ============================================================
     LOADING
  ============================================================ */

  if (!ready) {
    return (
      <StaffLoading label="Loading Panda Bites..." />
    );
  }

  /* ============================================================
     LOGIN
  ============================================================ */

  if (!session) {
    return <StaffLogin />;
  }

  if (!rolesReady) {
    return (
      <StaffLoading label="Checking staff access..." />
    );
  }

  /* ============================================================
     ACCESS DENIED
  ============================================================ */

  if (!isAdmin && !isChef) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#fbf5ef] px-5 py-8 text-[#21191a]">
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#e85c72]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#f6d7dc] blur-3xl" />

        <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <div className="w-full max-w-xl rounded-[2rem] border border-[#ecdfe0] bg-white p-8 text-center shadow-[0_30px_80px_-30px_rgba(70,30,40,0.22)] md:p-12">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-[#fff0f2]">
              <ShieldCheck className="h-9 w-9 text-[#d84460]" />
            </div>

            <p className="mt-7 text-[10px] font-black uppercase tracking-[0.28em] text-[#d84460]">
              Panda Bites Staff
            </p>

            <h1 className="mt-3 font-display text-4xl tracking-tight">
              No staff access
            </h1>

            <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#746b6d]">
              Your account does not currently have the Chef
              or Administrator role required to access the
              staff workspace.
            </p>

            <Button
              onClick={signOut}
              className="mt-8 h-12 rounded-xl bg-[#21191a] px-6 text-white hover:bg-[#332728]"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  const activeItem = visibleNavItems.find(
    (item) =>
      location.pathname === item.to ||
      location.pathname.startsWith(`${item.to}/`),
  );

  const roleLabel = isAdmin
    ? "Administrator"
    : isBulkChef
      ? "Bulk Chef"
      : "Chef";

  const roleLetter = isAdmin
    ? "A"
    : isBulkChef
      ? "B"
      : "C";

  return (
    <div className="min-h-screen bg-[#fbf5ef] text-[#21191a]">
      {/* ========================================================
          MOBILE BACKDROP
      ======================================================== */}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[#21191a]/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ========================================================
          SIDEBAR
      ======================================================== */}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col",
          "border-r border-[#eadedf] bg-white",
          "shadow-[12px_0_40px_-30px_rgba(50,20,30,0.35)]",
          "transition-transform duration-300",
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        {/* Brand */}

        <div className="flex h-[84px] items-center justify-between border-b border-[#f0e5e4] px-5">
          <Link
            to="/staff/orders"
            onClick={() => setMobileOpen(false)}
            className="group flex items-center gap-3"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-[#f6d7dc] blur-md transition-all group-hover:blur-lg" />

              <img
                src={pandaMascot}
                alt="Panda Bites"
                className="relative h-11 w-11 rounded-2xl object-cover shadow-sm"
              />
            </div>

            <div>
              <p className="font-display text-[21px] leading-none">
                Panda Bites
              </p>

              <p className="mt-1.5 text-[8px] font-black uppercase tracking-[0.25em] text-[#a39a9b]">
                Staff workspace
              </p>
            </div>
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mb-4 flex items-center justify-between px-2">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#aaa0a1]">
              Workspace
            </p>

            <span className="rounded-full bg-[#f8e9eb] px-2 py-1 text-[8px] font-bold text-[#c83e58]">
              LIVE
            </span>
          </div>

          <div className="space-y-1.5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;

              const active =
                location.pathname === item.to ||
                location.pathname.startsWith(
                  `${item.to}/`,
                );

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={[
                    "group relative flex h-12 items-center gap-3 rounded-2xl px-3",
                    "text-sm font-semibold transition-all duration-200",
                    active
                      ? "bg-[#21191a] text-white shadow-[0_10px_25px_-12px_rgba(30,15,18,0.7)]"
                      : "text-[#756b6d] hover:bg-[#fff3f4] hover:text-[#21191a]",
                  ].join(" ")}
                >
                  {active && (
                    <span className="absolute left-0 h-6 w-1 rounded-r-full bg-[#ed7185]" />
                  )}

                  <span
                    className={[
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
                      active
                        ? "bg-white/10"
                        : "bg-[#faf0f1] group-hover:bg-[#f8e0e4]",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "h-[17px] w-[17px]",
                        active
                          ? "text-white"
                          : "text-[#b04a5e]",
                      ].join(" ")}
                    />
                  </span>

                  <span className="flex-1">
                    {item.label}
                  </span>

                  {active && (
                    <ArrowRight className="h-3.5 w-3.5 text-white/50" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom account area */}

        <div className="border-t border-[#f0e5e4] p-4">
          <div className="rounded-2xl bg-[#fbf5ef] p-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#21191a] text-xs font-black text-white">
                  {roleLetter}
                </div>

                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#fbf5ef] bg-[#54b77c]" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  {roleLabel}
                </p>

                <p className="mt-0.5 text-[9px] text-[#94898b]">
                  Staff account
                </p>
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1">
            <Button
              type="button"
              variant="ghost"
              onClick={toggleTheme}
              className="h-10 rounded-xl text-[11px] text-[#817779] hover:bg-[#fff0f2]"
            >
              {darkMode ? (
                <Sun className="mr-1.5 h-4 w-4" />
              ) : (
                <Moon className="mr-1.5 h-4 w-4" />
              )}
              Theme
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={signOut}
              className="h-10 rounded-xl text-[11px] text-[#817779] hover:bg-[#fff0f2] hover:text-[#d84460]"
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* ========================================================
          MAIN
      ======================================================== */}

      <div className="min-h-screen lg:pl-[270px]">
        {/* Top navigation */}

        <header className="sticky top-0 z-30 h-[76px] border-b border-[#eadedf] bg-[#fbf5ef]/90 backdrop-blur-2xl">
          <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-xl border-[#eadedf] bg-white lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <ClipboardList className="h-4 w-4" />
              </Button>

              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.28em] text-[#d84460]">
                  Panda Bites
                </p>

                <h1 className="mt-0.5 truncate font-display text-[22px] leading-tight">
                  {activeItem?.label ?? "Staff"}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-[#e9dfe0] bg-white px-3.5 py-2 sm:flex">
                <span className="h-2 w-2 rounded-full bg-[#54b77c] shadow-[0_0_0_3px_rgba(84,183,124,0.12)]" />

                <span className="text-[10px] font-bold text-[#756b6d]">
                  Online
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleTheme}
                className="h-10 w-10 rounded-xl border-[#e9dfe0] bg-white"
              >
                {darkMode ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>

              <div className="flex items-center gap-2 rounded-full border border-[#e9dfe0] bg-white py-1.5 pl-1.5 pr-3">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-[#21191a] text-[10px] font-black text-white">
                  {roleLetter}
                </div>

                <div className="hidden sm:block">
                  <p className="text-[10px] font-bold">
                    {roleLabel}
                  </p>

                  <p className="text-[8px] text-[#958a8c]">
                    Panda Bites staff
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1540px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ==============================================================
   LOADING SCREEN
============================================================== */

function StaffLoading({
  label,
}: {
  label: string;
}) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#fbf5ef] px-6">
      <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[#e85c72]/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-[#f6d7dc] blur-3xl" />

      <div className="relative text-center">
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 rounded-[1.75rem] bg-[#f6d7dc] blur-xl" />

          <img
            src={pandaMascot}
            alt="Panda Bites"
            className="relative h-20 w-20 rounded-[1.75rem] object-cover shadow-xl"
          />
        </div>

        <div className="mt-6 flex justify-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d84460]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d84460] [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d84460] [animation-delay:300ms]" />
        </div>

        <p className="mt-4 text-xs font-semibold text-[#817779]">
          {label}
        </p>
      </div>
    </div>
  );
}

/* ==============================================================
   LOGIN PAGE
============================================================== */

function StaffLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      const { error } =
        await supabase.auth.signInWithPassword({
          email: staffUsernameToEmail(username),
          password,
        });

      if (error) {
        throw error;
      }

      toast.success("Welcome back to Panda Bites");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? "Wrong username or password"
          : "Sign in failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbf5ef] text-[#21191a]">
      {/* ========================================================
          BACKGROUND ART
      ======================================================== */}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-[#e85c72]/10 blur-3xl" />

        <div className="absolute -bottom-60 -right-40 h-[650px] w-[650px] rounded-full bg-[#f4d7dc] blur-3xl" />

        <div className="absolute left-[8%] top-[32%] h-3 w-3 rounded-full bg-[#d84460]/20" />

        <div className="absolute right-[12%] top-[18%] h-2 w-2 rounded-full bg-[#d84460]/25" />

        <div className="absolute bottom-[22%] left-[18%] h-2 w-2 rounded-full bg-[#d84460]/20" />

        <div className="absolute right-[28%] bottom-[15%] h-3 w-3 rounded-full bg-[#e9a6b1]/30" />
      </div>

      {/* ========================================================
          TOP BRAND
      ======================================================== */}

      <div className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link
          to="/"
          className="group flex items-center gap-3"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-[#eabac3] blur-md transition-all group-hover:blur-lg" />

            <img
              src={pandaMascot}
              alt="Panda Bites"
              className="relative h-11 w-11 rounded-2xl object-cover shadow-sm"
            />
          </div>

          <div>
            <p className="font-display text-xl leading-none">
              Panda Bites
            </p>

            <p className="mt-1 text-[8px] font-black uppercase tracking-[0.25em] text-[#988e90]">
              Staff workspace
            </p>
          </div>
        </Link>

        <div className="hidden items-center gap-2 rounded-full border border-[#e8dfe0] bg-white/70 px-3.5 py-2 backdrop-blur-md sm:flex">
          <LockKeyhole className="h-3.5 w-3.5 text-[#c7475f]" />

          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#817779]">
            Secure access
          </span>
        </div>
      </div>

      {/* ========================================================
          LOGIN CONTENT
      ======================================================== */}

      <div className="relative z-10 flex min-h-[calc(100vh-88px)] items-center justify-center px-5 pb-12 pt-4 sm:px-8">
        <div className="w-full max-w-[1120px] overflow-hidden rounded-[2.5rem] border border-[#eadedf] bg-white shadow-[0_40px_100px_-40px_rgba(60,25,35,0.3)] lg:grid lg:grid-cols-[0.95fr_1.05fr]">
          {/* ----------------------------------------------------
              LEFT VISUAL PANEL
          ---------------------------------------------------- */}

          <div className="relative hidden min-h-[650px] overflow-hidden bg-[#21191a] p-10 text-white lg:block xl:p-14">
            <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-[#d84460]/20 blur-3xl" />

            <div className="absolute -bottom-48 -left-40 h-[500px] w-[500px] rounded-full bg-[#f29aaa]/10 blur-3xl" />

            <div className="absolute right-10 top-24 h-2 w-2 rounded-full bg-white/20" />

            <div className="absolute bottom-40 left-16 h-3 w-3 rounded-full bg-white/10" />

            <div className="relative flex h-full flex-col">
              {/* Mini badge */}

              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#61c98a]" />

                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/45">
                  Staff portal
                </span>
              </div>

              {/* Hero */}

              <div className="mt-auto">
                <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-sm">
                  <img
                    src={pandaMascot}
                    alt="Panda Bites"
                    className="h-24 w-24 rounded-[1.7rem] object-cover"
                  />
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#ed7b8d]">
                  Behind the counter
                </p>

                <h1 className="mt-4 max-w-md font-display text-[4.5rem] leading-[0.88] tracking-tight">
                  Welcome
                  <br />
                  back.
                </h1>

                <p className="mt-7 max-w-sm text-sm leading-7 text-white/55">
                  Everything your team needs to keep Panda
                  Bites moving. Orders, menus, messages,
                  discounts, and more.
                </p>
              </div>

              {/* Bottom stats */}

              <div className="mt-12 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <CircleCheck className="h-4 w-4 text-[#61c98a]" />

                  <p className="mt-3 text-[9px] font-black uppercase tracking-wider text-white/35">
                    Access
                  </p>

                  <p className="mt-1 text-xs font-bold">
                    Protected
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <ShieldCheck className="h-4 w-4 text-[#ed7b8d]" />

                  <p className="mt-3 text-[9px] font-black uppercase tracking-wider text-white/35">
                    Roles
                  </p>

                  <p className="mt-1 text-xs font-bold">
                    Verified
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <Zap className="h-4 w-4 text-[#eebd74]" />

                  <p className="mt-3 text-[9px] font-black uppercase tracking-wider text-white/35">
                    System
                  </p>

                  <p className="mt-1 text-xs font-bold">
                    Online
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------
              LOGIN FORM
          ---------------------------------------------------- */}

          <div className="flex min-h-[620px] items-center px-7 py-10 sm:px-12 lg:px-14 xl:px-20">
            <div className="mx-auto w-full max-w-[430px]">
              {/* Mobile logo */}

              <div className="mb-10 flex items-center gap-3 lg:hidden">
                <img
                  src={pandaMascot}
                  alt="Panda Bites"
                  className="h-12 w-12 rounded-2xl object-cover shadow-sm"
                />

                <div>
                  <p className="font-display text-xl">
                    Panda Bites
                  </p>

                  <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#9a9091]">
                    Staff workspace
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d84460]">
                  Staff sign in
                </p>

                <h2 className="mt-3 font-display text-[2.9rem] leading-none tracking-tight sm:text-[3.25rem]">
                  Sign in.
                </h2>

                <p className="mt-5 max-w-sm text-sm leading-6 text-[#827779]">
                  Enter your staff credentials to access
                  the Panda Bites workspace.
                </p>
              </div>

              <form
                onSubmit={onSubmit}
                className="mt-9"
              >
                <div className="space-y-5">
                  {/* Username */}

                  <div>
                    <Label
                      htmlFor="staff-username"
                      className="text-[10px] font-black uppercase tracking-[0.18em] text-[#453a3c]"
                    >
                      Username
                    </Label>

                    <div className="relative mt-2.5">
                      <Input
                        id="staff-username"
                        value={username}
                        onChange={(event) =>
                          setUsername(event.target.value)
                        }
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        placeholder="Your staff username"
                        className="h-14 rounded-2xl border-[#e7dcdd] bg-[#fcf8f4] px-4 text-sm shadow-none transition-all placeholder:text-[#afa5a6] focus:border-[#d84460] focus:bg-white focus:ring-4 focus:ring-[#d84460]/10"
                      />
                    </div>
                  </div>

                  {/* Password */}

                  <div>
                    <Label
                      htmlFor="staff-password"
                      className="text-[10px] font-black uppercase tracking-[0.18em] text-[#453a3c]"
                    >
                      Password
                    </Label>

                    <div className="relative mt-2.5">
                      <Input
                        id="staff-password"
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        autoComplete="current-password"
                        required
                        placeholder="Your password"
                        className="h-14 rounded-2xl border-[#e7dcdd] bg-[#fcf8f4] px-4 pr-12 text-sm shadow-none transition-all placeholder:text-[#afa5a6] focus:border-[#d84460] focus:bg-white focus:ring-4 focus:ring-[#d84460]/10"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword(
                            (value) => !value,
                          )
                        }
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-[#9a9091] transition-colors hover:bg-[#fff0f2] hover:text-[#d84460]"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit */}

                <Button
                  disabled={loading}
                  type="submit"
                  className="group mt-7 h-14 w-full rounded-2xl bg-[#21191a] text-sm font-bold text-white shadow-[0_15px_30px_-15px_rgba(33,25,26,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#332728] hover:shadow-[0_20px_35px_-15px_rgba(33,25,26,0.75)] disabled:pointer-events-none disabled:opacity-60"
                >
                  {loading ? (
                    <span className="flex items-center gap-2.5">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Enter workspace

                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  )}
                </Button>

                {/* Security card */}

                <div className="mt-6 rounded-2xl border border-[#eadfe0] bg-[#fff8f8] p-4">
                  <div className="flex gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fcebed]">
                      <LockKeyhole className="h-4 w-4 text-[#d84460]" />
                    </div>

                    <div>
                      <p className="text-xs font-bold text-[#3c3133]">
                        Secure staff access
                      </p>

                      <p className="mt-1 text-[11px] leading-5 text-[#8c8082]">
                        Your account must have a verified
                        Chef or Administrator role.
                      </p>
                    </div>
                  </div>
                </div>
              </form>

              <div className="mt-8 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#aaa0a1]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#54b77c]" />
                Panda Bites Staff Portal
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
