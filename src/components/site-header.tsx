import { Link } from "@tanstack/react-router";
import { ShoppingBag, History, LogOut } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart-store";
import { CartDrawer } from "@/components/cart-drawer";
import { motion } from "framer-motion";
import { useVerifiedSession } from "@/lib/use-verified-session";

export function SiteHeader() {
  const count = useCart((s) => s.count());
  const [open, setOpen] = useState(false);
  const session = useVerifiedSession();

  async function signOut() {
    await fetch("/api/public/verify/logout", { method: "POST" });
    window.location.href = "/verify";
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream text-lg">🐼</span>
            <span className="font-display text-2xl tracking-tight">Panda Bites</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link to="/" activeOptions={{ exact: true }} className="text-ink/80 hover:text-ink [&.active]:text-cherry">Home</Link>
            <Link to="/menu" className="text-ink/80 hover:text-ink [&.active]:text-cherry">Menu</Link>
            <Link to="/history" className="text-ink/80 hover:text-ink [&.active]:text-cherry">Orders</Link>
            <Link to="/staff" className="text-ink/80 hover:text-ink [&.active]:text-cherry">Staff</Link>
          </nav>
          <div className="flex items-center gap-2">
            {session && (
              <div className="hidden items-center gap-2 rounded-full border border-border bg-blossom px-2 py-1 pr-3 text-xs font-medium text-ink sm:flex">
                {session.avatar_url ? (
                  <img src={session.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-cherry text-cream text-[10px]">🐼</span>
                )}
                <span>@{session.username}</span>
                <button onClick={signOut} className="text-ink/40 hover:text-cherry" title="Sign out">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <Link to="/history" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-blossom text-ink hover:bg-cherry hover:text-cream md:hidden" aria-label="Orders">
              <History className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="relative flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:bg-ink/90"
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
