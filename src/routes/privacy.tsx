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
          "How Panda Bites cares for member and staff data — plus Bamboo Desk for questions, exports, and deletion requests.",
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
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
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
      transition={{ duration: 0.45 }}
      className="rounded-3xl border border-ink/8 bg-white/75 p-5 shadow-[0_16px_50px_-28px_rgba(60,20,40,0.4)] backdrop-blur-sm md:p-7"
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
        className="fixed left-0 right-0 top-0 z-50 h-1.5 origin-left bg-gradient-to-r from-blossom via-cherry to-petal"
        style={{ scaleX }}
      />

      <SiteHeader />

      <main className="relative overflow-hidden pb-24">
        <div className="pointer-events-none absolute right-0 top-16 h-80 w-80 rounded-full bg-cherry/10 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-72 h-72 w-72 rounded-full bg-blossom/40 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cherry">
              Legal · soft gloves on
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[0.92] md:text-6xl">
              Privacy <span className="italic text-cherry">Policy</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/65">
              A longer look at how we hold kitchen data — with a floating panda
              desk if you need to ask, export, or request a deletion.
            </p>
            <p className="mt-3 text-xs uppercase tracking-widest text-ink/45">
              Last updated · August 17, 2026
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-8 grid gap-3 sm:grid-cols-3"
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
                <p className="mt-1 text-ink/60">{c.body}</p>
              </div>
            ))}
          </motion.div>

          <div className="mt-14 space-y-12 md:space-y-16">
            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">1. Who is wearing the apron?</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Panda Bites is a community Discord kitchen for Bloxburg food orders. This Privacy Policy explains what we handle on our website, member tools, and staff systems.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Roblox, Bloxburg, and Discord are separate platforms with their own policies. We cannot rewrite those from our blossom-colored booth.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">2. The ingredients we may process</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Staff accounts: sign-in identifiers, roles (admin / chef), and optional staff profile fields used to run the shop.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Member profiles: usernames or handles you look up, plus rewards, perks, or history views tied to that lookup.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Orders: items, quantities, fees, discounts, status, and notes a chef needs to fulfill a ticket.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Technical breadcrumbs: error reports, security diagnostics, and basic request metadata so we can fix breaks and block abuse.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">On-device scraps: Skippe drafts or model preference may live in your browser until you clear site data.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">3. Why those jars are on the shelf</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We use information to take and fulfill orders, show deals and profiles, authenticate staff, debug outages, and improve kitchen tools — including optional AI helpers for staff.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We do not sell personal information. We do not feed member lists to third-party ad networks for fun or profit.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">4. Skippe and other AI sous-chefs</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Staff may send operational prompts through an AI gateway so Skippe can suggest kitchen actions. Providers process that content under their terms.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Please keep prompts free of passwords and anything more personal than the ticket requires. AI is not a vault and not a therapist.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">5. Who else might glimpse a ticket</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Chefs and admins fulfilling or supervising orders may see what they need to cook.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Hosting and database providers that power the app process data to keep the lights on.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We may disclose information when law or safety truly requires it.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">When you click out to partners or Discord, their policies take the whisk.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">6. How long we keep things warm</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Order and profile records stay while the kitchen needs them for fulfillment, history features, and basic dispute handling.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Staff may clean or anonymize older data when it is no longer useful. You can clear browser storage anytime.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">7. Security without cape claims</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Staff areas use sign-in and roles. Databases use safeguards including row-level policies where configured.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">No system is perfect. Use a strong unique password for staff access and never share it with helpful strangers in DMs.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">8. Younger players</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Gaming communities often include minors under platform rules. We aim to collect only what the shop needs.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Parents or guardians who want a record reviewed can reach kitchen staff through the official Discord or Bamboo Desk on this page.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">9. Your soft control panel</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Skip profile lookup anytime. Ask staff to fix or remove data when practical. Clear site data in your browser. Leave staff roles if you no longer want kitchen access.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">For formal export or deletion requests, open Bamboo Desk (bottom right), choose Email my data or Delete my data, and send a ticket to staff.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">10. Cookies and similar crumbs</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We use storage needed for sign-in where applicable, light preferences, and app function. We are not running a carnival of third-party ad trackers on the menu.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">11. Crossing regions</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Servers and tools may live in regions different from where you play. By using Panda Bites you understand information can be processed where our providers operate.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">If local law gives you extra rights, contact staff — we will work through reasonable requests with the tools we have.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">12. When this policy gets a new coat of paint</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We may update this page as features grow. The Last updated line is the signal. Staying in the kitchen after a change means you have seen the new version.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">13. Come talk — Bamboo Desk is open</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Privacy questions, export requests, and deletion requests can start from the Bamboo Desk button on this page. You can also message staff in the official Discord.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We are a community kitchen. Replies may slow down during dinner rush, but your note is not intentionally thrown in the compost.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  More rules, same kitchen
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Pair this with our 
                  <Link
                    to="/terms"
                    className="font-medium text-cherry underline decoration-cherry/30 underline-offset-4"
                  >
                    Terms of Service
                  </Link>
                  . For a living request, open Bamboo Desk on the bottom right.
                </p>
              </SoftCard>
            </FadeSection>
          </div>
        </div>
      </main>

      <SupportAgentFab page="privacy" />
      <SiteFooter />
    </div>
  );
}
