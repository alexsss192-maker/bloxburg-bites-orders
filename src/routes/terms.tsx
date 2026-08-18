import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useSpring } from "framer-motion";
import { type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SupportAgentFab } from "@/components/support-agent";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Panda Bites" },
      {
        name: "description",
        content:
          "The extra-long, extra-cute Panda Bites kitchen rulebook — orders, B$, chefs, deals, Skippe, and Bamboo Desk support.",
      },
      { property: "og:title", content: "Terms of Service — Panda Bites" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

function FadeSection({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.section>
  );
}

function SoftCard({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 12 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5 }}
      className={
        accent
          ? "rounded-[1.75rem] border border-cherry/20 bg-gradient-to-br from-white via-blossom/40 to-petal/25 p-6 shadow-[0_20px_60px_-32px_rgba(180,40,80,0.35)] md:p-8"
          : "rounded-[1.75rem] border border-ink/8 bg-white/80 p-6 shadow-[0_18px_55px_-30px_rgba(60,20,40,0.4)] backdrop-blur-sm md:p-8"
      }
    >
      {children}
    </motion.div>
  );
}

function EmojiRow({ items }: { items: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((e) => (
        <motion.span
          key={e}
          className="grid h-10 w-10 place-items-center rounded-2xl bg-white/90 text-lg shadow-sm ring-1 ring-ink/5"
          whileHover={{ y: -3, rotate: [-4, 4, 0] }}
          transition={{ type: "spring", stiffness: 400, damping: 12 }}
        >
          {e}
        </motion.span>
      ))}
    </div>
  );
}

function Bullet({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-ink/80">
      <span className="mt-0.5 text-base">{emoji}</span>
      <span>{children}</span>
    </li>
  );
}


function TermsPage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    restDelta: 0.001,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-1.5 origin-left bg-gradient-to-r from-cherry via-petal to-blossom"
        style={{ scaleX }}
      />

      <SiteHeader />

      <main className="relative overflow-hidden pb-28">
        {/* floating decor */}
        <motion.div
          className="pointer-events-none absolute left-[8%] top-24 text-4xl opacity-40"
          animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          🌸
        </motion.div>
        <motion.div
          className="pointer-events-none absolute right-[10%] top-40 text-3xl opacity-35"
          animate={{ y: [0, 14, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          🧁
        </motion.div>
        <motion.div
          className="pointer-events-none absolute left-[15%] top-[55%] text-3xl opacity-30"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        >
          🎀
        </motion.div>
        <div className="pointer-events-none absolute -left-28 top-10 h-[28rem] w-[28rem] rounded-full bg-blossom/45 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-52 h-[32rem] w-[32rem] rounded-full bg-petal/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-[70%] h-72 w-72 -translate-x-1/2 rounded-full bg-cherry/8 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-22">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-cherry">
              Legal · whipped cream edition
            </p>
            <h1 className="mt-4 font-display text-4xl leading-[0.9] md:text-6xl lg:text-7xl">
              Terms of{" "}
              <span className="italic text-cherry">Service</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/65">
              The longest, softest rulebook in the kitchen — written for hungry
              explorers, patient chefs, and anyone who pays in B$ with a little
              heart on the side.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-ink/40">
              Last updated · August 17, 2026 · Vol. 01 Blossom Issue
            </p>
            <EmojiRow items={["🐼", "🌸", "🍔", "✨", "💌", "🧁"]} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55 }}
            className="mt-10 grid gap-3 sm:grid-cols-2"
          >
            {[
              { t: "Orders & B$", d: "Baskets, fees, promo magic" },
              { t: "Chefs & delivery", d: "In-game drops, real humans" },
              { t: "Be kind", d: "House manners for everyone" },
              { t: "Bamboo Desk", d: "Questions, export, delete" },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-2xl border border-ink/8 bg-white/75 px-4 py-3 shadow-sm"
              >
                <p className="text-sm font-semibold text-ink">{c.t}</p>
                <p className="mt-0.5 text-xs text-ink/50">{c.d}</p>
              </div>
            ))}
          </motion.div>

          <FadeSection delay={0.05}>
            <SoftCard accent>
              <p className="text-sm leading-relaxed text-ink/80">
                <span className="mr-2 text-xl">🐼</span>
                Stuck on a section? Tap{" "}
                <strong className="text-cherry">Bamboo Desk</strong> (bottom
                right) anytime to ask a question, request a data export, or ask
                staff to delete what they can. Soft ears. No judgment.
              </p>
            </SoftCard>
          </FadeSection>

          <div className="mt-16 space-y-14 md:space-y-20">
            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  1. Pull up a stool — the agreement
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  By browsing Panda Bites, opening My Profile, filling a basket,
                  pinging chefs, or using staff tools, you agree to these Terms
                  and our{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-cherry underline decoration-cherry/30 underline-offset-4"
                  >
                    Privacy Policy
                  </Link>
                  . If you need more time, leave the tab open and come back with
                  a snack — we will still be here.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  These Terms cover the website, Discord-connected shop flows,
                  member features, and staff portals. Partner sites (like
                  Seasonal Foods) wear their own aprons once you hop the fence.
                </p>
                <EmojiRow items={["📜", "🌷", "☕"]} />
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                2. What this kitchen is (and isn&apos;t)
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Panda Bites is a community-run Discord kitchen that helps you
                order adorable non-seasonal Bloxburg bites and points you toward
                seasonal friends when needed. You pay in Bloxburg dollars (B$).
                Real chefs deliver in-game.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We are fans and organizers — not Roblox, not official Bloxburg
                staff, and not a brick-and-mortar café with a health inspector.
                Virtual crumbs only. Our stage is menus, baskets, deals,
                profiles, and chef coordination wrapped in cherry blossoms.
              </p>
              <ul className="mt-5 space-y-3">
                <Bullet emoji="🌸">Community shop, not a corporate franchise</Bullet>
                <Bullet emoji="🎮">Lives inside Discord + Bloxburg play</Bullet>
                <Bullet emoji="💛">Run by people who actually like feeding the lobby</Bullet>
              </ul>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  3. Who may pull up a chair
                </h2>
                <ul className="mt-5 space-y-3">
                  <Bullet emoji="🌸">
                    Follow Roblox and Bloxburg conduct rules while you play and
                    trade.
                  </Bullet>
                  <Bullet emoji="🎀">
                    Staff tools are only for accounts our admins trusted with
                    chef or admin roles.
                  </Bullet>
                  <Bullet emoji="🧁">
                    If local law needs a parent or guardian for online services,
                    involve them. Safe kitchens are cute kitchens.
                  </Bullet>
                  <Bullet emoji="🚫">
                    We may refuse service for harassment, scams, or shop-breaking
                    attempts.
                  </Bullet>
                </ul>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                4. Baskets, totals & the B$ waltz
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Menu prices are in B$. Totals can rise with bulk or fast-service
                fees and fall with chef discounts or promo codes. Checkout
                previews are best guesses until a chef confirms what they can
                fulfill in the moment.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Payment runs through the Discord / in-game process the kitchen
                explains. This site is not a random real-money checkout unless
                we clearly add that later and put a big sign on it.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                An order is a warm request, not a teleport spell. Timing depends
                on who is online, how busy Bloxburg feels, and how stacked the
                ticket is. Rush hour exists even in pixel kitchens.
              </p>
              <EmojiRow items={["🛒", "💵", "⏱️", "🧾"]} />
            </FadeSection>

            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  5. Delivery dreams vs. server weather
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Chefs try hard. Lags, privacy settings, full servers, or sudden
                  disconnects can slow a drop-off. We cannot control Roblox
                  storms or plot permissions.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  If something goes sideways, message staff in Discord with your
                  order details. Soft voices resolve tickets faster than
                  all-caps monologues. We (or a chef) may pause, adjust, or
                  cancel orders that look impossible, abusive, mistaken, or
                  against these Terms.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                6. Deals, codes & the honor system
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Promo codes and automatic discounts are little gifts from the
                kitchen or individual chefs. They can expire, run out, or change
                without a parade. Private staff codes are not for public
                billboards.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Stacking tricks that violate posted deal rules may cancel an
                order and, if repeated, pause shop access. Kindness keeps the
                discount jar full for everyone.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  7. My Profile — your sticker book
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Optional profiles show rewards, perks, and history tied to a
                  username you look up. Keep submissions honest. Profiles are a
                  convenience feature — not a bank, passport, or promise of
                  infinite free snacks.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  How that data is stored and shared lives in the{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-cherry underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                8. Chefs, admins & shiny keys
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Kitchen roles come with trust. Do not snoop for sport, leak
                tickets, or use tools to bully. Admins may change or revoke
                access anytime — including when someone treats the portal like a
                playground for chaos.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Skippe and other helpers are power tools. Humans remain
                responsible for what actually changes on the ticket board.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  9. House manners (acceptable use)
                </h2>
                <ul className="mt-5 space-y-3">
                  <Bullet emoji="💛">Be kind to chefs, members, and staff</Bullet>
                  <Bullet emoji="🛡️">Do not spam, scrape, or overload the shop</Bullet>
                  <Bullet emoji="🚪">Do not bypass roles, payments, or security</Bullet>
                  <Bullet emoji="🎭">Do not impersonate Panda Bites or staff</Bullet>
                  <Bullet emoji="🧹">Do not upload illegal or harmful content</Bullet>
                </ul>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Security testing without permission is not a cute prank. Report
                  bugs to staff instead of throwing spaghetti at production.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                10. Skippe, the AI sous-chef
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Staff may use Skippe to draft actions, set fees, or sort kitchen
                chores. AI can misread a ticket or invent a confident wrong
                answer. Chefs must double-check important changes before they
                stick.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Never paste passwords, private Discord DMs, or extra personal
                data into AI prompts. The sous-chef does not need your life
                story to adjust a bulk fee.
              </p>
              <EmojiRow items={["🤖", "📝", "🔒"]} />
            </FadeSection>

            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  11. Intellectual cozy property
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Panda Bites branding, layout, and original copy on this site
                  belong to the kitchen project. Roblox, Bloxburg, and other
                  marks belong to their owners. Please do not clone the shop
                  wholesale or resell our tooling as your own franchise.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                12. Third-party stages
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Discord, Roblox, Bloxburg, hosting providers, and AI gateways are
                third parties. Their outages, bans, and rule changes can affect
                your experience. We are not their global customer-support desk —
                but we will still try to be helpful about what happens inside
                our kitchen.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                13. “As is,” said with a bow
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                We offer the service as a community convenience. Features may
                change, break, or nap during updates. We do not promise perfect
                uptime, perfect AI, or five-minute fulfillment on every craving.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Virtual items and B$ exist only inside third-party worlds with
                their own physics and policies.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  14. Liability limits
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  To the fullest extent the law allows, Panda Bites and its
                  volunteers are not liable for indirect or consequential
                  damages, lost B$, lost items, or data hiccups from the site,
                  Discord, Roblox, or Bloxburg.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  If a court says a particular limit cannot apply, the rest of
                  these Terms still stand like a well-built countertop.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                15. Refunds & make-goods (community style)
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Because payment is in-game B$ and fulfillment is volunteer-led,
                “refunds” are handled case-by-case by staff and chefs — not as a
                chargeback through a bank. If a ticket fails for kitchen-side
                reasons, talk to Discord staff promptly with details so we can
                try a fair make-good.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                16. Suspension & goodbyes
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                You may stop using the site anytime. We may suspend access for
                repeated harm to the kitchen or breaches of these Terms.
                Sections that should survive goodbye (like liability limits)
                will survive.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  17. Changes to the rule menu
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  We may update these Terms as the shop grows. The date at the
                  top is your crumb trail. Keeping the oven on after a change
                  means you accept the new batch.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  18. Talk to Bamboo Desk
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Questions about these Terms? Use the floating Bamboo Desk
                  button to ask staff-facing questions, request a data export, or
                  request deletion. You can also reach the official Panda Bites
                  Discord.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  We are a community kitchen — replies may take time during rush
                  hour, but we do not intentionally compost your notes.
                </p>
                <EmojiRow items={["💌", "🐼", "🌸"]} />
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <div className="rounded-[1.75rem] border border-dashed border-ink/15 bg-white/50 p-6 text-center md:p-10">
                <p className="text-3xl">🌷</p>
                <p className="mt-3 font-display text-xl text-ink">
                  Still curious about data?
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink/65">
                  The{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-cherry underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>{" "}
                  is next door — same soft energy, more detail on what we hold
                  and how to request export or deletion.
                </p>
              </div>
            </FadeSection>
          </div>
        </div>
      </main>

      <SupportAgentFab page="terms" />
      <SiteFooter />
    </div>
  );
}
