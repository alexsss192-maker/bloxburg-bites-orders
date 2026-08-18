import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useSpring } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Panda Bites" },
      {
        name: "description",
        content:
          "How Panda Bites cares for member and staff information — profiles, orders, logs, and kitchen tools — with as much transparency as a glass display case.",
      },
      { property: "og:title", content: "Privacy Policy — Panda Bites" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
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

function PrivacyPage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-1 origin-left bg-gradient-to-r from-blossom via-cherry to-petal"
        style={{ scaleX }}
      />

      <SiteHeader />

      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute right-0 top-24 h-72 w-72 rounded-full bg-cherry/10 blur-3xl" />
        <div className="pointer-events-none absolute left-10 top-96 h-56 w-56 rounded-full bg-blossom/50 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cherry">
              Legal · soft gloves on
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[0.95] md:text-6xl">
              Privacy <span className="italic text-cherry">Policy</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink/65">
              How we hold kitchen data — orders, profiles, staff logins, and the
              occasional error log — without turning the pantry into a billboard.
            </p>
            <p className="mt-3 text-xs uppercase tracking-widest text-ink/45">
              Last updated · August 17, 2026
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mt-8 grid gap-3 sm:grid-cols-3"
          >
            {[
              { emoji: "🧺", title: "Only what we need", body: "Orders, roles, profiles — not your life story." },
              { emoji: "🔒", title: "Staff gates", body: "Chef tools sit behind sign-in and roles." },
              { emoji: "🚫", title: "No data yard sales", body: "We do not sell member info to advertisers." },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-ink/8 bg-white/70 p-4 text-sm shadow-sm"
              >
                <p className="text-xl">{c.emoji}</p>
                <p className="mt-2 font-semibold text-ink">{c.title}</p>
                <p className="mt-1 text-ink/60">{c.body}</p>
              </div>
            ))}
          </motion.div>

          <div className="mt-14 space-y-12">
            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">1. Who is stirring the pot?</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Panda Bites is a community Discord kitchen for Bloxburg food
                  orders. This policy describes information we handle on our
                  website, member tools, and staff systems. Roblox, Bloxburg, and
                  Discord are separate services with their own privacy notices —
                  we cannot rewrite those from our little booth.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">2. What we may process</h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink/80">
                <p>
                  <strong className="text-ink">Staff accounts.</strong> Sign-in
                  identifiers (such as the kitchen’s auth email style), role
                  flags (admin / chef), and optional staff profile fields used to
                  run the shop.
                </p>
                <p>
                  <strong className="text-ink">Member profiles.</strong>{" "}
                  Usernames or handles you type to open My Profile, plus
                  rewards, perks, or history views tied to that lookup.
                </p>
                <p>
                  <strong className="text-ink">Orders.</strong> Items,
                  quantities, fees, discounts, status, and notes needed so a
                  chef can actually cook the ticket.
                </p>
                <p>
                  <strong className="text-ink">Technical breadcrumbs.</strong>{" "}
                  Error reports, security diagnostics, and basic request
                  metadata (timing, rough client info) so we can fix breaks and
                  block abuse.
                </p>
                <p>
                  <strong className="text-ink">On-device scraps.</strong> Things
                  like Skippe chat drafts or model preference may live in your
                  browser storage until you clear them.
                </p>
              </div>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">3. Why we hold it</h2>
                <ul className="mt-4 space-y-2 text-sm text-ink/80">
                  <li>• Take orders and help chefs finish them</li>
                  <li>• Show deals, profiles, and order history features</li>
                  <li>• Keep staff doors locked to the right people</li>
                  <li>• Debug outages, spam, and security weirdness</li>
                  <li>• Improve kitchen tools (including optional AI helpers)</li>
                </ul>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  We do <em>not</em> sell personal information. We do not plug
                  member lists into third-party ad networks.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">4. Skippe & other AI helpers</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Staff may send operational prompts through an AI gateway (for
                example Lovable’s) so Skippe can suggest kitchen actions. Those
                providers process content under their terms. Please keep prompts
                free of passwords and anything more personal than the ticket
                requires. AI is a sous-chef, not a vault.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">5. Who else might see a ticket</h2>
              <ul className="mt-4 space-y-3 text-sm text-ink/80">
                <li className="flex gap-3">
                  <span>🍳</span>
                  <span>Chefs and admins fulfilling or supervising orders</span>
                </li>
                <li className="flex gap-3">
                  <span>☁️</span>
                  <span>
                    Hosting and database providers that power the app (such as
                    Lovable Cloud / compatible backends)
                  </span>
                </li>
                <li className="flex gap-3">
                  <span>⚖️</span>
                  <span>When law or safety genuinely requires a disclosure</span>
                </li>
                <li className="flex gap-3">
                  <span>🌷</span>
                  <span>
                    When you click out to partners (Seasonal Foods, Discord) —
                    their policies take over there
                  </span>
                </li>
              </ul>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">6. How long we keep the jars</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Order and profile records stick around while the kitchen needs
                  them for fulfillment, history features, and basic dispute
                  handling. Staff may clean or anonymize older data when it is
                  no longer useful. You can clear browser storage whenever you
                  like.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">7. Security, said without superhero claims</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We use sign-in for staff areas, role checks, and database
                safeguards (including row-level policies where we have them
                configured). No online system is perfect. Use a strong unique
                password for staff access and never share it in Discord DMs with
                “helpful strangers.”
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">8. Younger players</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Gaming communities often include minors under platform rules. We
                aim to collect only what the shop needs. Parents or guardians who
                want a profile or order record reviewed can reach kitchen staff
                through the official Discord.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">9. Your little control panel</h2>
                <ul className="mt-4 space-y-2 text-sm text-ink/80">
                  <li>• Skip profile lookup anytime</li>
                  <li>• Ask staff to fix or remove data when practical</li>
                  <li>• Clear site data in your browser settings</li>
                  <li>• Leave staff roles if you no longer want kitchen access</li>
                </ul>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">10. Cookies & similar bits</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We use storage needed to keep you signed in where applicable,
                remember light preferences, and run the app. We are not running
                a carnival of third-party ad trackers on the menu pages.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">11. International notes</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Servers and tools may sit in regions different from where you
                play. By using Panda Bites you understand information can be
                processed where our providers operate. If a local law gives you
                extra rights, contact staff and we will work through reasonable
                requests.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl">12. When this policy changes</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We may update this page as features grow. The “Last updated”
                line is the signal. Staying in the kitchen after a change means
                you have seen the new version.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl">13. Come talk to us</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Privacy questions belong in the official Panda Bites Discord
                  with staff. We are a community kitchen — replies may take a
                  little while during dinner rush, but your note will not be
                  composted on purpose.
                </p>
                <p className="mt-4 text-sm text-ink/60">
                  Hungry for the rulebook? Read the{" "}
                  <Link
                    to="/terms"
                    className="font-medium text-cherry underline underline-offset-4"
                  >
                    Terms of Service
                  </Link>
                  .
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
