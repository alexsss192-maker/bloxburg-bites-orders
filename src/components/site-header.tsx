import { Link, useRouterState } from "@tanstack/react-router";
import {
  ShoppingBag,
  Moon,
  Sun,
  Menu,
  Home,
  UtensilsCrossed,
  Tag,
  User,
  ClipboardList,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { CartDrawer } from "@/components/cart-drawer";
import { useTheme } from "@/hooks/use-theme";
import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import pandaMascot from "@/assets/panda-mascot.png";

const NAV_LINKS = [
  { to: "/", label: "Home", exact: true, icon: Home },
  { to: "/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/deals", label: "Deals", icon: Tag },
  { to: "/me", label: "My Profile", icon: User },
  { to: "/history", label: "Orders", icon: ClipboardList },
  { to: "/staff", label: "Staff", icon: Shield },
] as const;

const BOTTOM_NAV = [
  { to: "/", label: "Home", exact: true, icon: Home },
  { to: "/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/deals", label: "Deals", icon: Tag },
  { to: "/history", label: "Orders", icon: ClipboardList },
  { to: "/me", label: "Profile", icon: User },
] as const;

export function SiteHeader() {
  const count = useCart((s) => s.count());
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    document.documentElement.classList.add("has-mobile-tabbar");
    return () => {
      document.documentElement.classList.remove("has-mobile-tabbar");
    };
  }, []);

  function isActive(to: string, exact?: boolean) {
    if (exact) return pathname === to;
    return pathname === to || pathname.startsWith(`${to}/`);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-cream/80 backdrop-blur-xl supports-[backdrop-filter]:bg-cream/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-card text-ink transition hover:bg-petal md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/" className="flex min-w-0 items-center gap-2">
              <img
                src={pandaMascot}
                alt="Panda Bites"
                className="h-9 w-9 shrink-0 rounded-full object-cover shadow-sm"
              />
              <span className="font-display truncate text-xl tracking-tight sm:text-2xl">
                Panda Bites
              </span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-border bg-card/80 p-1 text-sm font-semibold md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={"exact" in link && link.exact ? { exact: true } : undefined}
                className="rounded-full px-4 py-2 text-ink/65 transition hover:bg-petal hover:text-ink [&.active]:bg-cherry [&.active]:text-cream"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-ink transition hover:bg-petal hover:text-cherry"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="pb-press relative flex h-11 items-center gap-2 rounded-full bg-ink px-3.5 text-sm font-semibold text-cream transition hover:bg-cherry sm:px-4"
              aria-label={`Basket${count > 0 ? `, ${count} items` : ""}`}
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Basket</span>
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="grid h-5 min-w-5 place-items-center rounded-full bg-cherry px-1.5 text-xs font-semibold text-cream"
                >
                  {count}
                </motion.span>
              )}
            </button>
          </div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(100%,20rem)] flex-col gap-0 border-border bg-cream p-0 text-ink"
        >
          <SheetHeader className="border-b border-border px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-3 font-display text-2xl tracking-tight text-ink">
              <img
                src={pandaMascot}
                alt="Panda Bites"
                className="h-10 w-10 rounded-full object-cover shadow-sm"
              />
              Panda Bites
            </SheetTitle>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/45">
              Navigate
            </p>
          </SheetHeader>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                const active = isActive(
                  link.to,
                  "exact" in link ? link.exact : false,
                );
                return (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      activeOptions={
                        "exact" in link && link.exact
                          ? { exact: true }
                          : undefined
                      }
                      onClick={() => setMenuOpen(false)}
                      className={[
                        "flex min-h-12 items-center gap-3 rounded-2xl px-3 py-3 text-base font-semibold transition",
                        active
                          ? "bg-cherry text-cream shadow-sm"
                          : "text-ink/75 hover:bg-petal hover:text-ink",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "grid h-9 w-9 place-items-center rounded-xl",
                          active ? "bg-cream/15" : "bg-card",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setCartOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3.5 text-sm font-bold text-cream transition hover:bg-cherry"
            >
              <ShoppingBag className="h-4 w-4" />
              Open basket
              {count > 0 ? ` · ${count}` : ""}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-cream/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pt-1">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(
              item.to,
              "exact" in item ? item.exact : false,
            );
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  activeOptions={
                    "exact" in item && item.exact ? { exact: true } : undefined
                  }
                  className={[
                    "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-bold tracking-wide transition",
                    active ? "text-cherry" : "text-ink/45 hover:text-ink/70",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-8 w-8 place-items-center rounded-full transition",
                      active ? "bg-cherry/15 text-cherry" : "",
                    ].join(" ")}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
