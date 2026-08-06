import { Link } from "@tanstack/react-router";
import { ShoppingBag, History } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart-store";
import { CartDrawer } from "@/components/cart-drawer";
import { motion } from "framer-motion";

export function SiteHeader() {
  const count = useCart((s) => s.count());
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-cream/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream text-lg">🐼</span>
            <span className="font-display text-2xl tracking-tight">Panda Bites</span>
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-border bg-card/80 p-1 text-sm font-semibold md:flex">
            {[
              { to: "/", label: "Home", exact: true },
              { to: "/menu", label: "Menu" },
              { to: "/history", label: "Orders" },
              { to: "/staff", label: "Staff" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={link.exact ? { exact: true } : undefined}
                className="rounded-full px-4 py-2 text-ink/65 transition hover:bg-petal hover:text-ink [&.active]:bg-cherry [&.active]:text-cream"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/history" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-ink hover:bg-cherry hover:text-cream md:hidden" aria-label="Orders">
              <History className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="pb-press relative flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream transition hover:bg-cherry"
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
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
