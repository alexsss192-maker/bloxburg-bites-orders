import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BadgePercent, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getPublicDeals } from "@/lib/menu.functions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const dealsQuery = {
  queryKey: ["public-deals"],
  queryFn: () => getPublicDeals(),
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
};

export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title: "Deals & Promo Codes — Panda Bites" },
      {
        name: "description",
        content: "Every live Panda Bites discount in one place — grab a chef's promo code and save B$ at checkout.",
      },
      { property: "og:title", content: "Deals & Promo Codes — Panda Bites" },
      { property: "og:description", content: "Live promo codes and automatic discounts from Panda Bites chefs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dealsQuery),
  component: DealsPage,
});

function DealsPage() {
  const { data: deals } = useSuspenseQuery(dealsQuery);

  const groups = deals.reduce<Record<string, typeof deals>>((acc, deal) => {
    const key = deal.owner_id;
    (acc[key] ??= []).push(deal);
    return acc;
  }, {});
  const ordered = Object.values(groups).sort((a, b) => {
    const aAdmin = a[0]!.is_admin ? 0 : 1;
    const bAdmin = b[0]!.is_admin ? 0 : 1;
    return aAdmin - bAdmin || a[0]!.chef_username.localeCompare(b[0]!.chef_username);
  });

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">Live right now</p>
          <h1 className="mt-2 font-display text-6xl leading-[0.95] text-balance md:text-7xl">
            Deals &amp; <span className="italic text-cherry">codes</span>.
          </h1>
          <p className="mt-3 max-w-lg text-sm text-ink/60">
            Every discount our chefs are running. Copy a code and paste it at checkout — automatic ones apply
            themselves. Each deal only applies to that chef's own items.
          </p>
        </div>

        {deals.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
            <BadgePercent className="mx-auto h-8 w-8 text-cherry" />
            <p className="mt-3 font-display text-3xl">No live deals yet</p>
            <p className="mt-2 text-sm text-ink/60">Our chefs are cooking something up. Check back soon!</p>
            <Link
              to="/menu"
              className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry"
            >
              Browse the menu
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            {ordered.map((group) => {
              const chef = group[0]!;
              return (
                <section key={chef.owner_id}>
                  <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-ink/10 pb-3">
                    <h2 className="font-display text-3xl">{chef.chef_username}</h2>
                    {chef.is_admin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-cream">
                        <Sparkles className="h-3 w-3" /> House menu
                      </span>
                    )}
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.map((deal) => (
                      <article
                        key={deal.id}
                        className="flex flex-col justify-between rounded-3xl border border-border/60 bg-white p-6 transition hover:shadow-lg"
                      >
                        <div>
                          <p className="font-display text-4xl text-cherry">
                            {deal.discount_type === "percentage"
                              ? `${deal.value}%`
                              : `B$${deal.value.toLocaleString()}`}
                            <span className="ml-1 font-display text-xl text-ink/60">off</span>
                          </p>
                          <p className="mt-2 font-display text-2xl leading-tight">{deal.name}</p>
                          {deal.ends_at && (
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink/45">
                              until {new Date(deal.ends_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        {deal.is_automatic ? (
                          <p className="mt-5 rounded-2xl bg-petal px-4 py-3 text-sm font-semibold text-cherry">
                            Applies automatically at checkout
                          </p>
                        ) : (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(deal.code ?? "");
                              toast.success(`Code ${deal.code} copied`);
                            }}
                            className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-cherry/50 bg-petal px-4 py-3 text-left transition hover:border-cherry"
                          >
                            <span className="font-mono text-lg font-bold tracking-widest text-ink">{deal.code}</span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-cherry">
                              <Copy className="h-3.5 w-3.5" /> Copy
                            </span>
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
