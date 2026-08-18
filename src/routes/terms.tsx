import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useSpring } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Panda Bites" },
      {
        name: "description",
        content:
          "The cozy rules of the Panda Bites kitchen — ordering in B$, chef delivery, deals, and how we keep the Discord shop kind.",
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
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
      className="relative"
    >
      {children}
    </motion.section>
  );
}

function SoftCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl border border-ink/8 bg-white/70 p-5 shadow-[0_12px_40px_-24px_rgba(60,20,40,0.35)] backdrop-blur-sm md:p-6"
    >
      {children}
    </motion.div>
  );
}

function TermsPage() {
  const mainRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-1 origin-left bg-gradient-to-r from-cherry via-petal to-blossom"
        style={{ scaleX }}
      />

      <SiteHeader />

      <main ref={mainRef} className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-full bg-blossom/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-80 h-72 w-72 rounded-full bg-petal/30 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cherry">
              Legal · with extra sprinkles
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[0.95] md:text-6xl">
              Terms of{" "}
              <span className="italic text-cherry">Service</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink/65">
              Welcome to the kitchen rulebook — written for hungry Bloxburg
              explorers, patient chefs, and anyone who pays in B$ with a smile.
              Please read with a snack nearby.
            </p>
            <p className="mt-3 text-xs uppercase tracking-widest text-ink/45">
              Last updated · August 17, 2026
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mt-8 flex flex-wrap gap-2"
          >
            {[
              "Orders & B$",
              "Chefs & delivery",
              "Deals",
              "Be kind",
              "Skippe AI",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-ink/10 bg-white/80 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-wider text-ink/60"
              >
                {tag}
              </span>
            ))}
          </motion.div>

          <div className="mt-14 space-y-12">
            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">1. A little agreement 🐼</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  By visiting Panda Bites, opening a profile, dropping items in
                  your basket, chatting with staff, or using chef tools, you
                  agree to these Terms and our{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-cherry underline decoration-cherry/30 underline-offset-4 hover:decoration-cherry"
                  >
                    Privacy Policy
                  </Link>
                  . If something here feels off for you, that is okay — simply
                  step away from the menu until you are comfortable.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  These Terms cover the website, Discord-connected shop flows,
                  member tools, and staff portals we operate for the community
                  kitchen. Partner sites (like Seasonal Foods) have their own
                  rules once you hop over.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection delay={0.05}>
              <h2 className="font-display text-2xl">2. What this kitchen is (and isn&apos;t)</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Panda Bites is a community-run Discord kitchen that helps you
                order cute non-seasonal Bloxburg bites (and points you toward
                seasonal friends when needed). You pay in Bloxburg dollars
                (B$). Real chefs deliver in-game. We are independent fans and
                organizers — not an official Roblox or Bloxburg product, and not
                endorsed by those platforms unless we say so out loud.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Think of us as a friendly pass-through: menus, baskets, deals,
                profiles, and chef coordination — wrapped in cherry blossoms and
                good intentions.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">3. Who can pull up a chair</h2>
              <ul className="mt-4 space-y-3 text-sm text-ink/80">
                <li className="flex gap-3">
                  <span className="text-lg">🌸</span>
                  <span>
                    Follow Roblox and Bloxburg conduct rules while you play and
                    trade.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-lg">🎀</span>
                  <span>
                    Staff tools are only for people our admins have trusted with
                    chef or admin roles.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-lg">🧁</span>
                  <span>
                    If local law says you need a parent or guardian for online
                    services, please involve them. We want the kitchen safe for
                    every age the platforms allow.
                  </span>
                </li>
              </ul>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">4. Ordering, baskets & B$</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Prices on the menu are in B$. Your total might grow a little
                  with bulk or fast-service fees, or shrink with chef discounts
                  and promo codes. Checkout previews are estimates until a chef
                  confirms what they can fulfill.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Payment happens through the Discord / in-game process the
                  kitchen explains — not through random real-money checkouts on
                  this site unless we clearly add that later. An order is a warm
                  request to a chef, not a magic teleport. Timing depends on who
                  is online, how busy Bloxburg is, and how stacked the ticket
                  is.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  We (or a chef) may pause, adjust, or cancel orders that look
                  impossible, abusive, mistaken, or against these Terms. If
                  something goes sideways, talk to staff in Discord — kindness
                  moves tickets faster than caps-lock.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">5. Delivery dreams vs. server realities</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Chefs will do their best to bring your food in-game. Lags,
                privacy settings, full servers, or “I got disconnected mid-fry”
                moments can slow things down. We cannot control Roblox uptime or
                Bloxburg house plots. What we can control: clear status updates
                and a team that actually cares.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">6. Deals, codes & sweet stacking rules</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Promo codes and automatic discounts are little gifts from the
                kitchen or individual chefs. They can expire, run out, or change.
                Private staff codes are not for public billboards. Trying to
                break deal logic on purpose may get an order canceled and, in
                repeat cases, a timeout from the shop.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">7. My Profile & member perks</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Optional profiles let you peek at rewards, perks, and order
                  history tied to a username you choose to look up. Keep your
                  info honest. Profiles are a convenience feature — not a bank,
                  not a legal ID, not a promise of infinite free snacks.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">8. Chefs, admins & the staff portal</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                If you hold a kitchen role, you agree to protect member trust:
                no snooping for fun, no leaking tickets, no using tools to bully.
                Admins may change roles or revoke access anytime. Skippe and
                other staff helpers are power tools — you are still the human
                holding them.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">9. House manners (acceptable use)</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Please do not harass anyone, spam the APIs, scrape the menu into
                oblivion, bypass payments or roles, upload nasty content, or
                pretend to be Panda Bites staff. Do not attempt to break security
                “as a joke.” We like jokes that do not involve SQL.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">10. Skippe, the AI sous-chef</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Staff may use Skippe to draft actions, set fees, or sort
                  kitchen chores. AI can misread a ticket or invent a confident
                  wrong answer. Chefs must double-check important changes. Never
                  paste passwords, private Discord DMs, or extra personal data
                  into AI prompts “just because.”
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">11. Intellectual cozy property</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Panda Bites branding, layout, and original copy on this site
                belong to the kitchen project. Roblox, Bloxburg, and other marks
                belong to their owners. You may not copy the shop wholesale or
                resell our tooling.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">12. “As is” — said gently</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We offer the service as a community convenience. Features may
                change, break, or nap during updates. We do not promise
                perfect uptime, perfect AI, or that every craving ships in five
                minutes. Virtual items and B$ live inside third-party worlds
                with their own physics and policies.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">13. Limits on liability</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                To the fullest extent the law allows, Panda Bites and its
                volunteers are not liable for indirect or consequential damages,
                lost B$, lost items, or data hiccups caused by the site, Discord,
                Roblox, or Bloxburg. If a court says some limit cannot apply,
                the rest of these Terms still do.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">14. Ending the visit</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                You can stop using the site anytime. We may suspend access for
                people who repeatedly harm the kitchen or break these Terms.
                Sections that should survive (like liability limits) will
                survive.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">15. Updates to this menu of rules</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We may refresh these Terms as the shop grows. The date at the
                top is your crumb trail. Keeping the oven on after a change
                means you are okay with the new batch.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">16. Say hello</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Questions about these Terms? Ping the official Panda Bites
                  Discord and ask for staff. We read tickets slower during rush
                  hour, but we do read them.
                </p>
                <p className="mt-4 text-sm text-ink/60">
                  Next stop:{" "}
                  <Link
                    to="/privacy"
                    className="font-medium text-cherry underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>{" "}
                  — how we handle the soft data side of the kitchen.
                </p>
              </SoftCard>
            </FadeSection>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
