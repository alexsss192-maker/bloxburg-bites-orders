import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useSpring } from "framer-motion";
import { type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SupportAgentFab } from "@/components/support-agent";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Panda Bites" },
      {
        name: "description",
        content:
          "Extra-long, extra-soft guide to how Panda Bites handles data — plus Bamboo Desk for questions, exports, and deletion requests.",
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


function PrivacyPage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    restDelta: 0.001,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-1.5 origin-left bg-gradient-to-r from-blossom via-cherry to-petal"
        style={{ scaleX }}
      />

      <SiteHeader />

      <main className="relative overflow-hidden pb-28">
        <motion.div
          className="pointer-events-none absolute right-[12%] top-28 text-4xl opacity-35"
          animate={{ y: [0, -11, 0], rotate: [0, -6, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        >
          🔒
        </motion.div>
        <motion.div
          className="pointer-events-none absolute left-[6%] top-56 text-3xl opacity-30"
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
        >
          🌸
        </motion.div>
        <div className="pointer-events-none absolute -right-20 top-10 h-[28rem] w-[28rem] rounded-full bg-cherry/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 top-80 h-[26rem] w-[26rem] rounded-full bg-blossom/40 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-22">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-cherry">
              Legal · soft gloves edition
            </p>
            <h1 className="mt-4 font-display text-4xl leading-[0.9] md:text-6xl lg:text-7xl">
              Privacy <span className="italic text-cherry">Policy</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/65">
              A longer, gentler tour of how we hold kitchen data — orders,
              profiles, staff keys, and the occasional error log — without
              turning the pantry into a billboard.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-ink/40">
              Last updated · August 17, 2026 · Vol. 01 Blossom Issue
            </p>
            <EmojiRow items={["🐼", "🔐", "📦", "🌷", "✉️", "🧹"]} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-10 grid gap-3 sm:grid-cols-3"
          >
            {[
              { emoji: "🧺", title: "Only what we need", body: "Orders, roles, profiles — not your diary." },
              { emoji: "🔒", title: "Staff gates", body: "Chef tools sit behind sign-in and roles." },
              { emoji: "🐼", title: "Bamboo Desk", body: "Ask, export, or request deletion anytime." },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-ink/8 bg-white/80 p-4 text-sm shadow-sm"
              >
                <p className="text-xl">{c.emoji}</p>
                <p className="mt-2 font-semibold text-ink">{c.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/55">{c.body}</p>
              </div>
            ))}
          </motion.div>

          <div className="mt-16 space-y-14 md:space-y-20">
            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  1. Who is wearing the apron?
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Panda Bites is a community Discord kitchen for Bloxburg food
                  orders. This Privacy Policy explains what we handle on our
                  website, member tools, and staff systems.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Roblox, Bloxburg, and Discord are separate platforms with their
                  own privacy notices. We cannot rewrite those from our
                  blossom-colored booth — but we can be clear about our corner.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                2. The ingredients we may process
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-ink/80">
                <p>
                  <strong className="text-ink">Staff accounts.</strong> Sign-in
                  identifiers, roles (admin / chef), and optional staff profile
                  fields used to run the shop.
                </p>
                <p>
                  <strong className="text-ink">Member profiles.</strong>{" "}
                  Usernames or handles you look up, plus rewards, perks, or
                  history views tied to that lookup.
                </p>
                <p>
                  <strong className="text-ink">Orders.</strong> Items,
                  quantities, fees, discounts, status, and notes a chef needs to
                  fulfill a ticket.
                </p>
                <p>
                  <strong className="text-ink">Technical breadcrumbs.</strong>{" "}
                  Error reports, security diagnostics, and basic request
                  metadata so we can fix breaks and block abuse.
                </p>
                <p>
                  <strong className="text-ink">On-device scraps.</strong> Skippe
                  drafts or model preference may live in your browser until you
                  clear site data.
                </p>
              </div>
              <EmojiRow items={["👤", "📋", "🛠️", "💻"]} />
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  3. Why those jars are on the shelf
                </h2>
                <ul className="mt-5 space-y-3">
                  <Bullet emoji="🍳">Take orders and help chefs finish them</Bullet>
                  <Bullet emoji="🎁">Show deals, profiles, and history features</Bullet>
                  <Bullet emoji="🔑">Keep staff doors locked to the right people</Bullet>
                  <Bullet emoji="🩹">Debug outages, spam, and security weirdness</Bullet>
                  <Bullet emoji="✨">Improve kitchen tools (including staff AI helpers)</Bullet>
                </ul>
                <p className="mt-5 text-sm leading-relaxed text-ink/80">
                  We do <em>not</em> sell personal information. We do not feed
                  member lists to third-party ad networks for fun or profit.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                4. Skippe & other AI sous-chefs
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Staff may send operational prompts through an AI gateway so
                Skippe can suggest kitchen actions. Providers process that
                content under their terms.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                Please keep prompts free of passwords and anything more personal
                than the ticket requires. AI is a sous-chef, not a vault and not
                a therapist.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  5. Who else might glimpse a ticket
                </h2>
                <ul className="mt-5 space-y-3">
                  <Bullet emoji="🍳">Chefs and admins fulfilling or supervising orders</Bullet>
                  <Bullet emoji="☁️">Hosting and database providers that power the app</Bullet>
                  <Bullet emoji="⚖️">When law or safety genuinely requires disclosure</Bullet>
                  <Bullet emoji="🌷">When you click out to partners — their policies take over</Bullet>
                </ul>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                6. How long we keep things warm
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Order and profile records stay while the kitchen needs them for
                fulfillment, history features, and basic dispute handling. Staff
                may clean or anonymize older data when it is no longer useful.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                You can clear browser storage whenever you like — that sweeps
                local scraps like chat drafts on your device.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  7. Security without cape claims
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Staff areas use sign-in and roles. Databases use safeguards
                  including row-level policies where configured. No online system
                  is perfect.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Use a strong unique password for staff access and never share
                  it with “helpful strangers” in DMs. If something feels phishy,
                  ask a known admin in the official server.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                8. Younger players
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Gaming communities often include minors under platform rules. We
                aim to collect only what the shop needs. Parents or guardians who
                want a record reviewed can reach kitchen staff through the
                official Discord or Bamboo Desk on this page.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  9. Your soft control panel
                </h2>
                <ul className="mt-5 space-y-3">
                  <Bullet emoji="🔍">Skip profile lookup anytime</Bullet>
                  <Bullet emoji="✏️">Ask staff to fix data when practical</Bullet>
                  <Bullet emoji="🧹">Clear site data in your browser</Bullet>
                  <Bullet emoji="🚪">Leave staff roles if you no longer want access</Bullet>
                  <Bullet emoji="🐼">
                    Open Bamboo Desk for export or deletion request tickets
                  </Bullet>
                </ul>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                10. Export & deletion (how it really works)
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                Panda Bites is a community kitchen, not a giant corporate portal
                with one-click legal automation. When you request an export or
                deletion through Bamboo Desk, you create a ticket for human
                staff.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink/80">
                We will do what we reasonably can: share copies of profile or
                order records we hold, or remove what is practical to remove.
                Some logs or backups may linger briefly for security and
                integrity. Platform data on Discord or Roblox is outside our
                direct delete button.
              </p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                11. Cookies & similar crumbs
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                We use storage needed for sign-in where applicable, light
                preferences, and app function. We are not running a carnival of
                third-party ad trackers across the menu pages.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  12. Crossing regions
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Servers and tools may live in regions different from where you
                  play. By using Panda Bites you understand information can be
                  processed where our providers operate.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  If local law gives you extra rights, contact staff — we will
                  work through reasonable requests with the tools we have.
                </p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">
                13. When this policy gets a new coat of paint
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/80">
                We may update this page as features grow. The Last updated line
                is the signal. Staying in the kitchen after a change means you
                have seen the new version.
              </p>
            </FadeSection>

            <FadeSection>
              <SoftCard accent>
                <h2 className="font-display text-2xl md:text-3xl">
                  14. Come talk — Bamboo Desk is open
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/80">
                  Privacy questions, export requests, and deletion requests can
                  start from the Bamboo Desk button (bottom right). You can also
                  message staff in the official Discord.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  We are a community kitchen. Replies may slow down during dinner
                  rush, but your note is not intentionally thrown in the
                  compost.
                </p>
                <EmojiRow items={["💌", "🐼", "🌸", "📦"]} />
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <div className="rounded-[1.75rem] border border-dashed border-ink/15 bg-white/50 p-6 text-center md:p-10">
                <p className="text-3xl">📜</p>
                <p className="mt-3 font-display text-xl text-ink">
                  Want the full house rules?
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink/65">
                  Read the{" "}
                  <Link
                    to="/terms"
                    className="font-medium text-cherry underline underline-offset-4"
                  >
                    Terms of Service
                  </Link>{" "}
                  for orders, B$, chefs, and kitchen manners — same cozy energy.
                </p>
              </div>
            </FadeSection>
          </div>
        </div>
      </main>

      <SupportAgentFab page="privacy" />
      <SiteFooter />
    </div>
  );
}
