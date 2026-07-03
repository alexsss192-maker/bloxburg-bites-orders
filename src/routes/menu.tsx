import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { getPublicMenu } from "@/lib/menu.functions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useCart } from "@/lib/cart-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const menuQuery = { queryKey: ["public-menu"], queryFn: () => getPublicMenu() };

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Panda Bites" },
      { name: "description", content: "Browse the non-seasonal Panda Bites menu and add items to your basket." },
      { property: "og:title", content: "Menu — Panda Bites" },
      { property: "og:description", content: "Browse the non-seasonal Panda Bites menu." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQuery),
  component: MenuPage,
});

type Tab = "non_seasonal" | "seasonal";

function MenuPage() {
  const [tab, setTab] = useState<Tab>("non_seasonal");
  const [seasonalOpen, setSeasonalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">The Menu</p>
            <h1 className="mt-2 font-display text-5xl md:text-6xl">Pick your bites</h1>
          </div>
          <div className="inline-flex rounded-full border border-ink/15 bg-white p-1 shadow-sm">
            <TabButton active={tab === "non_seasonal"} onClick={() => setTab("non_seasonal")}>Non-Seasonals</TabButton>
            <TabButton
              active={tab === "seasonal"}
              onClick={() => { setTab("seasonal"); setSeasonalOpen(true); }}
            >Seasonals</TabButton>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {tab === "non_seasonal" ? (
            <motion.div key="ns" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <NonSeasonalGrid />
            </motion.div>
          ) : (
            <motion.div key="s" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SeasonalPlaceholder onOpen={() => setSeasonalOpen(true)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <SiteFooter />

      <Dialog open={seasonalOpen} onOpenChange={setSeasonalOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl">Seasonal shop is separate 🍁</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              Our seasonal foods live on a different Discord and site. Head over there to order — but you'll need to
              join that Discord to get access.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full rounded-full bg-cherry py-6 text-cream hover:bg-cherry/90"
              onClick={() => window.open("https://seasonalfoods.lovable.app/", "_blank", "noopener,noreferrer")}
            >Go to seasonal shop →</Button>
            <Button
              variant="ghost"
              className="w-full rounded-full"
              onClick={() => { setSeasonalOpen(false); setTab("non_seasonal"); }}
            >Stay on non-seasonals</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-full px-6 py-2.5 text-sm font-semibold transition ${active ? "text-cream" : "text-ink/70 hover:text-ink"}`}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-ink"
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

function NonSeasonalGrid() {
  const { data: items } = useSuspenseQuery(menuQuery);
  const add = useCart((s) => s.add);
  const cartItems = useCart((s) => s.items);

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-ink/20 bg-white/50 p-16 text-center">
        <p className="font-display text-3xl">No items on the menu yet</p>
        <p className="mt-2 text-muted-foreground">Our chefs are prepping. Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => {
        const inCart = cartItems.find((c) => c.menu_item_id === item.id)?.quantity ?? 0;
        const remaining = item.stock - inCart;
        const soldOut = item.stock <= 0;
        return (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -4 }}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-xl"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="grid h-full w-full place-items-center text-6xl">🍰</div>
              )}
              {soldOut && (
                <div className="absolute inset-0 grid place-items-center bg-ink/60 backdrop-blur-sm">
                  <span className="rounded-full bg-cherry px-4 py-1 text-xs font-semibold uppercase tracking-widest text-cream">Sold out</span>
                </div>
              )}
              <div className="absolute right-3 top-3 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold text-ink">
                Stock: {item.stock}
              </div>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-2xl leading-tight">{item.name}</h3>
                <span className="whitespace-nowrap font-display text-xl text-cherry">B${item.price_bs.toLocaleString()}</span>
              </div>
              {item.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
              <button
                onClick={() => {
                  add({ menu_item_id: item.id, name: item.name, price_bs: item.price_bs, image_url: item.image_url, max_stock: item.stock });
                  toast.success(`${item.name} added to basket`);
                }}
                disabled={soldOut || remaining <= 0}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-cream transition hover:bg-cherry disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                <Plus className="h-4 w-4" />
                {soldOut ? "Unavailable" : remaining <= 0 ? "Max in basket" : "Add to basket"}
              </button>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}

function SeasonalPlaceholder({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-ink/20 bg-white/60 p-16 text-center">
      <p className="font-display text-4xl">Seasonal foods live somewhere else</p>
      <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
        We keep seasonal drops on a separate site so they stay tidy. Open the shop, join the Discord and go wild.
      </p>
      <button
        onClick={onOpen}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-cherry px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry/90"
      >Open seasonal info</button>
    </div>
  );
}