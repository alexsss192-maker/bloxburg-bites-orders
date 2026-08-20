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

const menuQuery = {
  queryKey: ["public-menu"],
  queryFn: () => getPublicMenu(),
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
};
const chefsQuery = {
  queryKey: ["public-chefs"],
  queryFn: () => getPublicChefs(),
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

const PRICE_FILTERS: Array<{ label: string; max: number | null }> = [
  { label: "Any price", max: null },
  { label: "Under B$1k", max: 1000 },
  { label: "Under B$5k", max: 5000 },
  { label: "Under B$15k", max: 15000 },
  { label: "Under B$50k", max: 50000 },
];

function MenuPage() {
  const [tab, setTab] = useState<Tab>("non_seasonal");
  const { data: chefs } = useSuspenseQuery(chefsQuery);
  const [chefId, setChefId] = useState<string>(() => chefs[0]?.owner_id ?? "");
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
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
              Everyday
            </TabButton>
            <TabButton
              active={tab === "seasonal"}
              onClick={() => setTab("seasonal")}
            >
              Seasonal
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
          <select
            value={maxPrice ?? ""}
            onChange={(e) =>
              setMaxPrice(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-10 shrink-0 rounded-full border border-ink/10 bg-white px-3 text-sm text-ink/80"
            aria-label="Max price"
          >
            {PRICE_FILTERS.map((f) => (
              <option key={f.label} value={f.max ?? ""}>
                {f.label}
              </option>
            ))}
          </select>
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

  if (filtered.length === 0) {
    const hasFilters = Boolean(q) || maxPrice != null;
    return (
      <p className="py-16 text-center text-sm text-ink/50">
        {hasFilters
          ? "No matches — try another search or price."
          : "Nothing on this shelf yet."}
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((item) => {
        const inCart =
          cartItems.find((c) => c.menu_item_id === item.id)?.quantity ?? 0;
        const remaining = item.stock - inCart;
        const soldOut = item.stock <= 0;
        const unpriced = item.price_bs <= 0;
        const canAdd = !unpriced && !soldOut && remaining > 0;

        return (
          <article
            key={item.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white"
          >
            <div className="relative aspect-[5/3] bg-ink/5">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-3xl opacity-40">
                  {category === "seasonal" ? "🍁" : "🍰"}
                </div>
              )}
              {(soldOut || unpriced) && (
                <div className="absolute inset-0 grid place-items-center bg-ink/50">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink">
                    {unpriced ? "Price soon" : "Sold out"}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg leading-snug">{item.name}</h3>
                <span className="shrink-0 text-sm font-medium tabular-nums text-cherry">
                  {unpriced ? "—" : `B$${item.price_bs.toLocaleString()}`}
                </span>
              </div>
              {item.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-ink/50">
                  {item.description}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  add({
                    menu_item_id: item.id,
                    name: item.name,
                    price_bs: item.price_bs,
                    image_url: item.image_url,
                    max_stock: item.stock,
                  });
                  toast.success(`Added ${item.name}`);
                }}
                disabled={!canAdd}
                className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-cherry disabled:cursor-not-allowed disabled:bg-ink/30"
              >
                {canAdd && <Plus className="h-3.5 w-3.5" />}
                {unpriced
                  ? "Unavailable"
                  : soldOut
                    ? "Sold out"
                    : remaining <= 0
                      ? "In cart"
                      : "Add"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
