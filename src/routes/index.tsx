import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Utensils, Shield } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import pandaMascot from "@/assets/panda-mascot.png";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="panda-grain absolute inset-0 opacity-60" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-6 pb-20 pt-16 md:grid-cols-[1.15fr_1fr] md:pt-24">
            <div className="flex flex-col justify-center">
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-ink/15 bg-cream/80 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-ink/70"
              >
                <Sparkles className="h-3.5 w-3.5 text-cherry" /> Bloxburg's favorite food shop
              </motion.span>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="mt-6 font-display text-6xl leading-[0.95] md:text-8xl"
              >
                Serving <span className="text-cherry">tasty bites</span>
                <br /> straight from the panda.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-6 max-w-lg text-lg text-ink/70"
              >
                Panda Bites is a Discord-run kitchen delivering fresh Bloxburg foods. Non-seasonals available all year,
                seasonals rotate with the calendar.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link
                  to="/menu"
                  className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry"
                >
                  Explore the menu
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="https://seasonalfoods.lovable.app/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-6 py-3 text-sm font-semibold text-ink transition hover:border-cherry hover:text-cherry"
                >
                  Seasonal shop
                </a>
              </motion.div>
              <div className="mt-12 grid max-w-lg grid-cols-3 gap-6 text-xs uppercase tracking-widest text-ink/60">
                <Stat label="Paid in" value="B$" />
                <Stat label="Delivery" value="In-game" />
                <Stat label="Rating" value="5.0 ★" />
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 14 }}
              className="relative flex items-center justify-center"
            >
              <div className="absolute inset-10 rounded-full bg-cherry/20 blur-3xl" />
              <div className="relative aspect-square w-full max-w-md rounded-[3rem] border border-ink/10 bg-gradient-to-br from-cream to-white p-8 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]">
                <img src={pandaMascot} alt="Panda Bites mascot" width={512} height={512} className="h-full w-full object-contain" />
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20">
          <div className="grid gap-4 md:grid-cols-3">
            <Feature icon={<Utensils className="h-5 w-5" />} title="Fresh non-seasonal menu" text="Cakes, pastas, bento boxes and more — always in stock, always fresh." />
            <Feature icon={<Sparkles className="h-5 w-5" />} title="Seasonal drops" text="Valentine's, Halloween, Winter — rotating menus on our sister shop." />
            <Feature icon={<Shield className="h-5 w-5" />} title="Handled by chefs" text="Our chef team plates and delivers every order inside Bloxburg." />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="mt-1">{label}</p>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-cherry/10 text-cherry">
        {icon}
      </div>
      <p className="font-display text-xl">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}