import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getPublicChefs, getPublicMenu } from "@/lib/menu.functions";
import { isPublicBulkChef } from "@/lib/bulk-department";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useCart } from "@/lib/cart-store";
import { cacheGet, cacheSet, TTL_CHEFS, TTL_MENU } from "@/lib/client-cache";

const menuQuery = {
  queryKey: ["public-menu"],
  queryFn: async () => {
    const hit = cacheGet<Awaited<ReturnType<typeof getPublicMenu>>>("public-menu");
    if (hit) return hit;
    const data = await getPublicMenu();
    cacheSet("public-menu", data, TTL_MENU);
    return data;
  },
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
};
const chefsQuery = {
  queryKey: ["public-chefs"],
  queryFn: async () => {
    const hit = cacheGet<Awaited<ReturnType<typeof getPublicChefs>>>("public-chefs");
    if (hit) return hit;
    const data = await getPublicChefs();
    cacheSet("public-chefs", data, TTL_CHEFS);
    return data;
  },
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
};

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Panda Bites" },
      {
        name: "description",
        content:
          "Browse every Panda Bites chef menu and add seasonal and non-seasonal items to your basket.",
      },
      { property: "og:title", content: "Menu — Panda Bites" },
      {
        property: "og:description",
        content: "Browse chef menus of seasonal and non-seasonal Panda Bites foods.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(menuQuery),
      context.queryClient.ensureQueryData(chefsQuery),
    ]),
  component: MenuPage,
});

type Tab = "non_seasonal" | "seasonal";

function MenuPage() {
  const [tab, setTab] = useState<Tab>("non_seasonal");
  const { data: chefs } = useSuspenseQuery(chefsQuery);
  const [chefId, setChefId] = useState<string>(() => chefs[0]?.owner_id ?? "");
  const [search, setSearch] = useState("");
  /** Typeable max B$ (e.g. 100) — empty = no filter. Client-only. */
  const [maxPriceText, setMaxPriceText] = useState("");
  const maxPrice = useMemo(() => {
    const n = Number(String(maxPriceText).replace(/[,_\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }, [maxPriceText]);
  const activeChef =
    chefs.find((c) => c.owner_id === chefId) ?? chefs[0] ?? null;

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 md:py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl md:text-4xl">Menu</h1>
          <div className="inline-flex self-start rounded-full border border-ink/10 bg-white p-0.5">
            <TabButton
              active={tab === "non_seasonal"}
              onClick={() => setTab("non_seasonal")}
            >
              Non-seasonals
            </TabButton>
            <TabButton
              active={tab === "seasonal"}
              onClick={() => setTab("seasonal")}
            >
              Seasonals
            </TabButton>
          </div>
        </div>

        {/* Search + price — one quiet row */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-10 w-full rounded-full border border-ink/10 bg-white py-2 pl-9 pr-9 text-sm outline-none placeholder:text-ink/35 focus:border-ink/25"
              aria-label="Search menu"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/35 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="relative shrink-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink/40">
              Under B$
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={maxPriceText}
              onChange={(e) =>
                setMaxPriceText(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="100"
              className="h-10 w-36 rounded-full border border-ink/10 bg-white py-2 pl-[4.25rem] pr-3 text-sm tabular-nums outline-none placeholder:text-ink/30 focus:border-ink/25"
              aria-label="Show items under this B$ amount"
            />
          </div>
        </div>

        {chefs.length > 1 && (
          <div className="mb-5">
            <select
              value={activeChef?.owner_id ?? ""}
              onChange={(e) => setChefId(e.target.value)}
              className="h-10 w-full max-w-xs rounded-full border border-ink/10 bg-white px-4 text-sm text-ink"
              aria-label="Choose a kitchen"
            >
              {chefs.map((chef) => (
                <option key={chef.owner_id} value={chef.owner_id}>
                  {chef.username}
                  {isPublicBulkChef(chef) ? " · Bulk" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <MenuGrid
          category={tab}
          ownerId={activeChef?.owner_id ?? null}
          search={search}
          maxPrice={maxPrice}
        />
      </main>

      <SiteFooter />
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-full px-6 py-2.5 text-sm font-semibold transition ${
        active ? "text-cream" : "text-ink/70 hover:text-ink"
      }`}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-ink"
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 26,
          }}
        />
      )}

      <span className="relative">{children}</span>
    </button>
  );
}

function MenuGrid({
  category,
  ownerId,
  search,
  maxPrice,
}: {
  category: Tab;
  ownerId: string | null;
  search: string;
  maxPrice: number | null;
}) {
  const { data: items } = useSuspenseQuery(menuQuery);
  const add = useCart((s) => s.add);
  const cartItems = useCart((s) => s.items);

  const q = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (i.category !== category) return false;
        if (ownerId && i.owner_id !== ownerId) return false;
        if (maxPrice != null && i.price_bs > maxPrice) return false;
        if (q) {
          const hay = `${i.name} ${i.description ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [items, category, ownerId, maxPrice, q],
  );

  const featured = filtered[0];
  const rest = filtered.slice(1);

  if (filtered.length === 0) {
    const hasFilters = Boolean(q) || maxPrice != null;
    return (
      <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
        <p className="font-display text-3xl">
          {hasFilters
            ? "No matches"
            : `No ${category === "non_seasonal" ? "non-seasonal" : "seasonal"} items yet`}
        </p>
        <p className="mt-2 text-muted-foreground">
          {hasFilters
            ? "Try a different search or price."
            : "Our chefs are prepping this shelf. Check back soon!"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {featured && (
        <section className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
            {featured.image_url ? (
              <img
                src={featured.image_url}
                alt={featured.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-80 w-full place-items-center bg-muted text-8xl">
                {category === "seasonal" ? "🍁" : "🍰"}
              </div>
            )}
            <div className="absolute left-4 top-4 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink">
              Featured
            </div>
          </div>

          <div className="flex flex-col justify-center rounded-3xl border border-border/60 bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">
              {category === "seasonal" ? "Seasonal drop" : "Year-round"}
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-4xl leading-tight">
              {featured.name}
            </h2>
            <p className="mt-3 text-ink/70">{featured.description}</p>
            <div className="mt-6 flex items-center justify-between">
              <span className="font-display text-3xl text-cherry">
                {featured.price_bs > 0
                  ? `B$${featured.price_bs.toLocaleString()}`
                  : "Price coming soon"}
              </span>
              <span className="text-sm text-ink/60">Stock: {featured.stock}</span>
            </div>
            <button
              onClick={() => {
                add({
                  menu_item_id: featured.id,
                  name: featured.name,
                  price_bs: featured.price_bs,
                  image_url: featured.image_url,
                  max_stock: featured.stock,
                });
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

      <div className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((item, i) => {
          const inCart =
            cartItems.find((c) => c.menu_item_id === item.id)?.quantity ?? 0;
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
              className={`group flex flex-col overflow-hidden rounded-3xl border border-border bg-white transition-shadow hover:shadow-lg ${
                unpriced ? "opacity-80" : ""
              }`}
            >
              <div
                className={`relative aspect-[4/3] overflow-hidden bg-muted ${
                  unpriced ? "grayscale" : ""
                }`}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-6xl">
                    {category === "seasonal" ? "🍁" : "🍰"}
                  </div>
                )}
                {unpriced ? (
                  <div className="absolute inset-0 grid place-items-center bg-ink/45 backdrop-blur-sm">
                    <span className="rounded-full bg-cream px-4 py-1 text-xs font-semibold uppercase tracking-widest text-ink">
                      Price coming soon
                    </span>
                  </div>
                ) : soldOut ? (
                  <div className="absolute inset-0 grid place-items-center bg-ink/60 backdrop-blur-sm">
                    <span className="rounded-full bg-cherry px-4 py-1 text-xs font-semibold uppercase tracking-widest text-cream">
                      Sold out
                    </span>
                  </div>
                ) : null}
                <div className="absolute left-3 top-3 rounded-full bg-cream/95 px-3 py-1 text-xs font-semibold text-ink">
                  Stock: {item.stock}
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-xl sm:text-2xl leading-tight">
                    {item.name}
                  </h3>
                  <span className="whitespace-nowrap font-display text-xl text-cherry">
                    {unpriced ? "—" : `B$${item.price_bs.toLocaleString()}`}
                  </span>
                </div>
                {item.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}
                <button
                  onClick={() => {
                    add({
                      menu_item_id: item.id,
                      name: item.name,
                      price_bs: item.price_bs,
                      image_url: item.image_url,
                      max_stock: item.stock,
                    });
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
