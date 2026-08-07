import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { getPublicMenu } from "@/lib/menu.functions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useCart } from "@/lib/cart-store";

const menuQuery = { queryKey: ["public-menu"], queryFn: () => getPublicMenu() };

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Panda Bites" },
      { name: "description", content: "Browse the Panda Bites menu and add seasonal and non-seasonal items to your basket." },
      { property: "og:title", content: "Menu — Panda Bites" },
      { property: "og:description", content: "Browse seasonal and non-seasonal Panda Bites foods." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQuery),
  component: MenuPage,
});

type Tab = "non_seasonal" | "seasonal";

function MenuPage() {
  const [tab, setTab] = useState<Tab>("non_seasonal");

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-4 flex items-center justify-between border-b border-ink/10 pb-3 text-[0.7rem] uppercase tracking-[0.35em] text-ink/60">
          <span>Vol. 01 · The Menu</span>
          <span className="hidden md:inline">Pg. 02 — Chef shelf</span>
        </div>

        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">Today's shelf</p>
            <h1 className="mt-2 font-display text-6xl leading-[0.95] text-balance md:text-7xl">
              Pick your <span className="italic text-cherry">bites</span>.
            </h1>
            <p className="mt-3 max-w-md text-sm text-ink/60">
              Stock updates the second an order clears. Add what you love — pay in B$ at checkout.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-ink/15 bg-blossom p-1 shadow-sm">
            <TabButton active={tab === "non_seasonal"} onClick={() => setTab("non_seasonal")}>Non-Seasonals</TabButton>
            <TabButton active={tab === "seasonal"} onClick={() => setTab("seasonal")}>Seasonals</TabButton>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MenuGrid category={tab} />
          </motion.div>
        </AnimatePresence>

        <aside className="mt-16 rounded-3xl border border-ink/10 bg-white p-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cherry">Trusted partner</p>
              <p className="mt-1 font-display text-2xl">Seasonal Foods</p>
              <p className="max-w-md text-sm text-ink/60">
                Looking for limited drops from our partner? Their seasonal-only shop runs alongside Panda Bites.
              </p>
            </div>
            <a
              href="https://seasonalfoods.lovable.app/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-blossom px-6 py-3 text-sm font-semibold text-ink transition hover:border-cherry hover:text-cherry"
            >
              Visit Seasonal Foods ↗
            </a>
          </div>
        </aside>
      </main>
      <SiteFooter />
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

function MenuGrid({ category }: { category: Tab }) {
  const { data: items } = useSuspenseQuery(menuQuery);
  const add = useCart((s) => s.add);
  const cartItems = useCart((s) => s.items);
  const filtered = items.filter((i) => i.category === category);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  if (filtered.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
        <p className="font-display text-3xl">No {category === "non_seasonal" ? "non-seasonal" : "seasonal"} items yet</p>
        <p className="mt-2 text-muted-foreground">Our chefs are prepping this shelf. Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {featured && (
        <section className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
            {featured.image_url ? (
              <img src={featured.image_url} alt={featured.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-80 w-full place-items-center text-8xl bg-muted">{category === "seasonal" ? "🍁" : "🍰"}</div>
            )}
            <div className="absolute left-4 top-4 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink">
              Featured
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-3xl border border-border/60 bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">{category === "seasonal" ? "Seasonal drop" : "Year-round"}</p>
            <h2 className="mt-2 font-display text-4xl leading-tight">{featured.name}</h2>
            <p className="mt-3 text-ink/70">{featured.description}</p>
            <div className="mt-6 flex items-center justify-between">
              <span className="font-display text-3xl text-cherry">
                {featured.price_bs > 0 ? `B$${featured.price_bs.toLocaleString()}` : "Price coming soon"}
              </span>
              <span className="text-sm text-ink/60">Stock: {featured.stock}</span>
            </div>
            <button
              onClick={() => {
                add({ menu_item_id: featured.id, name: featured.name, price_bs: featured.price_bs, image_url: featured.image_url, max_stock: featured.stock });
                toast.success(`${featured.name} added to basket`);
              }}
              disabled={featured.stock <= 0 || featured.price_bs <= 0}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {featured.price_bs > 0 && <Plus className="h-4 w-4" />}
              {featured.price_bs <= 0
                ? "Chef is setting the price"
                : featured.stock <= 0
                  ? "Unavailable"
                  : "Add to basket"}
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((item, i) => {
          const inCart = cartItems.find((c) => c.menu_item_id === item.id)?.quantity ?? 0;
          const remaining = item.stock - inCart;
          const soldOut = item.stock <= 0;
          const unpriced = item.price_bs <= 0;
          return (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -4 }}
              className={`group flex flex-col overflow-hidden rounded-3xl border border-border bg-card bg-white transition-shadow hover:shadow-lg ${unpriced ? "opacity-80" : ""}`}
            >
              <div className={`relative aspect-[4/3] overflow-hidden bg-muted ${unpriced ? "grayscale" : ""}`}>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-6xl">{category === "seasonal" ? "🍁" : "🍰"}</div>
                )}
                {unpriced ? (
                  <div className="absolute inset-0 grid place-items-center bg-ink/45 backdrop-blur-sm">
                    <span className="rounded-full bg-cream px-4 py-1 text-xs font-semibold uppercase tracking-widest text-ink">
                      Price coming soon
                    </span>
                  </div>
                ) : soldOut ? (
                  <div className="absolute inset-0 grid place-items-center bg-ink/60 backdrop-blur-sm">
                    <span className="rounded-full bg-cherry px-4 py-1 text-xs font-semibold uppercase tracking-widest text-cream">Sold out</span>
                  </div>
                ) : null}
                <div className="absolute left-3 top-3 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold text-ink">
                  Stock: {item.stock}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-2xl leading-tight">{item.name}</h3>
                  <span className="whitespace-nowrap font-display text-xl text-cherry">
                    {unpriced ? "—" : `B$${item.price_bs.toLocaleString()}`}
                  </span>
                </div>
                {item.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
                <button
                  onClick={() => {
                    add({ menu_item_id: item.id, name: item.name, price_bs: item.price_bs, image_url: item.image_url, max_stock: item.stock });
                    toast.success(`${item.name} added to basket`);
                  }}
                  disabled={unpriced || soldOut || remaining <= 0}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-cream transition hover:bg-cherry disabled:cursor-not-allowed disabled:bg-ink/40"
                >
                  {!unpriced && <Plus className="h-4 w-4" />}
                  {unpriced
                    ? "Chef is setting the price"
                    : soldOut
                      ? "Unavailable"
                      : remaining <= 0
                        ? "Max in basket"
                        : "Add to basket"}
                </button>
              </div>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
