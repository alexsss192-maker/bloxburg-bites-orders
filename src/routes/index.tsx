import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import pandaMascot from "@/assets/panda-mascot.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Panda Bites — Bloxburg kitchen for Discord members" },
      {
        name: "description",
        content:
          "Order seasonal and non-seasonal Bloxburg foods from the Panda Bites chef team. Pay in B$, delivered in-game.",
      },
      { property: "og:title", content: "Panda Bites — Bloxburg kitchen for Discord members" },
      { property: "og:description", content: "Seasonal and non-seasonal Bloxburg bites, cooked by our chefs and paid in B$." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden">
          <div className="blossom-grain pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto max-w-7xl px-6 pt-10 md:pt-16">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-4 text-[0.7rem] uppercase tracking-[0.35em] text-ink/60">
              <span>Vol. 01 · The Blossom Issue</span>
              <span className="hidden md:inline">Panda Bites Magazine · Bloxburg Kitchen Quarterly</span>
              <span>{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>

            <div className="grid gap-12 pb-24 pt-12 md:grid-cols-[1.35fr_1fr] md:pt-16">
              <div className="flex flex-col justify-center">
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-cherry/30 bg-petal/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cherry"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Bloxburg's cutest kitchen
                </motion.span>

                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.6 }}
                  className="mt-6 font-display text-6xl leading-[0.92] tracking-tight text-balance md:text-[7.5rem]"
                >
                  A little
                  <span className="italic text-cherry"> blossom </span>
                  in every bite.
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mt-8 max-w-xl text-lg leading-relaxed text-ink/70"
                >
                  Panda Bites is a Discord-run kitchen serving fresh Bloxburg foods. Order in
                  <span className="font-semibold text-ink"> B$ </span>, delivered in-game by chefs who actually care.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="mt-10 flex flex-wrap items-center gap-3"
                >
                  <Link
                    to="/menu"
                    className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-cream transition hover:bg-cherry"
                  >
                    Open the menu
                    <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                  <a
                    href="https://seasonalfoods.lovable.app/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 rounded-full border border-ink/25 bg-blossom px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-ink transition hover:border-cherry hover:text-cherry"
                  >
                    Seasonal Foods
                  </a>
                </motion.div>

                <div className="mt-14 grid max-w-lg grid-cols-3 divide-x divide-ink/10 border-y border-ink/10 py-6 text-xs uppercase tracking-[0.25em] text-ink/60">
                  <Stat label="Currency" value="B$" />
                  <Stat label="Delivery" value="In-game" />
                  <Stat label="Rating" value="5.0★" />
                </div>
              </div>

              <motion.aside
                initial={{ opacity: 0, y: 30, rotate: -2 }}
                animate={{ opacity: 1, y: 0, rotate: 2 }}
                transition={{ type: "spring", stiffness: 90, damping: 16, delay: 0.1 }}
                className="relative mx-auto w-full max-w-md"
              >
                <div className="absolute -inset-6 rounded-[2.5rem] bg-petal/70 blur-2xl" />
                <div className="blossom-shadow relative overflow-hidden rounded-[2.25rem] border border-ink/10 bg-gradient-to-br from-blossom via-cream to-petal p-6">
                  <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.3em] text-ink/60">
                    <span>Issue №01</span>
                    <span>B$ · 2026</span>
                  </div>
                  <p className="mt-3 font-display text-5xl leading-none text-ink">Panda<br />Bites</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.3em] text-cherry">The Blossom Issue</p>

                  <div className="relative mt-6 aspect-square overflow-hidden rounded-3xl bg-gradient-to-b from-petal/60 to-blossom">
                    <div className="absolute inset-0 grid place-items-center">
                      <img src={pandaMascot} alt="Panda Bites mascot" width={512} height={512} className="h-4/5 w-4/5 object-contain" />
                    </div>
                  </div>

                  <ul className="mt-6 space-y-2 border-t border-ink/10 pt-4 text-xs uppercase tracking-[0.22em] text-ink/70">
                    <li className="flex justify-between"><span>01 · Non-seasonal menu</span><span className="text-cherry">pg. 02</span></li>
                    <li className="flex justify-between"><span>02 · Seasonal menu</span><span className="text-cherry">pg. 05</span></li>
                    <li className="flex justify-between"><span>03 · Basket & checkout</span><span className="text-cherry">pg. 08</span></li>
                  </ul>
                </div>
              </motion.aside>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="mb-10 flex items-end justify-between gap-6 border-b border-ink/10 pb-4">
            <h2 className="font-display text-4xl md:text-5xl">Editor's picks</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-ink/50">— read the issue</span>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Article
              tag="01 · The menu"
              title="Non-seasonal classics, always in stock."
              text="Cakes, pastas, and bento boxes that run year-round. Stock updates the instant an order clears."
              cta={{ to: "/menu", label: "Browse menu" }}
              tone="petal"
            />
            <Article
              tag="02 · Seasonal"
              title="Limited drops from our chefs."
              text="Valentine's, Halloween, Winter — now sold right here by Panda Bites chefs with their own seasonal menus."
              cta={{ to: "/menu", label: "Shop seasonals" }}
              tone="cream"
            />
            <Article
              tag="03 · Trusted partner"
              title="Seasonal Foods, the sister shop."
              text="Looking for a dedicated seasonal-only experience? Visit our trusted partner for members-only drops."
              cta={{ href: "https://seasonalfoods.lovable.app/", label: "Seasonal Foods ↗" }}
              tone="dark"
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 first:pl-0">
      <p className="font-display text-3xl text-ink">{value}</p>
      <p className="mt-1 text-[0.65rem]">{label}</p>
    </div>
  );
}

function Article({
  tag,
  title,
  text,
  cta,
  tone,
}: {
  tag: string;
  title: string;
  text: string;
  cta: { to?: string; href?: string; label: string };
  tone: "petal" | "cream" | "dark";
}) {
  const bg =
    tone === "petal" ? "bg-petal/60 text-ink" : tone === "cream" ? "bg-blossom text-ink" : "bg-ink text-cream";
  const border = tone === "dark" ? "border-ink" : "border-ink/10";
  const ctaClass =
    tone === "dark"
      ? "bg-cherry text-cream hover:bg-cream hover:text-ink"
      : "bg-ink text-cream hover:bg-cherry";
  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      className={`relative flex flex-col overflow-hidden rounded-3xl border ${border} ${bg} p-7`}
    >
      <p className="text-[0.7rem] uppercase tracking-[0.3em] opacity-70">{tag}</p>
      <h3 className="mt-4 font-display text-3xl leading-tight text-balance">{title}</h3>
      <p className="mt-3 text-sm opacity-80">{text}</p>
      <div className="mt-6">
        {cta.to ? (
          <Link
            to={cta.to}
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${ctaClass}`}
          >
            {cta.label} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <a
            href={cta.href}
            target="_blank"
            rel="noreferrer noopener"
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${ctaClass}`}
          >
            {cta.label}
          </a>
        )}
      </div>
    </motion.article>
  );
}
