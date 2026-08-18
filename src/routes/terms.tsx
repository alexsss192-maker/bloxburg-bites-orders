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
          "The long, cozy rulebook for Panda Bites — orders, B$, chefs, deals, Skippe, and how to reach Bamboo Desk support.",
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

function TermsPage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <motion.div
        className="fixed left-0 right-0 top-0 z-50 h-1.5 origin-left bg-gradient-to-r from-cherry via-petal to-blossom"
        style={{ scaleX }}
      />

      <SiteHeader />

      <main className="relative overflow-hidden pb-24">
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-blossom/50 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-40 h-96 w-96 rounded-full bg-petal/25 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 top-[40%] h-64 w-64 rounded-full bg-cherry/10 blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cherry">
              Legal · extra whipped cream
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[0.92] md:text-6xl">
              Terms of 
              <span className="italic text-cherry">Service</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/65">
              A longer, softer rulebook for the cutest Discord kitchen on the
              block. Scroll slowly. Pet the progress bar. Open 
              <strong className="font-semibold text-ink">Bamboo Desk</strong> 
              anytime if you need a human-shaped answer.
            </p>
            <p className="mt-3 text-xs uppercase tracking-widest text-ink/45">
              Last updated · August 17, 2026
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.5 }}
            className="mt-8 flex flex-wrap gap-2"
          >
            {[
              "Orders & B$",
              "Chefs",
              "Deals",
              "Profiles",
              "Skippe",
              "Bamboo Desk",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-ink/10 bg-white/85 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-ink/55"
              >
                {tag}
              </span>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 rounded-3xl border border-cherry/15 bg-gradient-to-br from-white via-blossom/30 to-petal/20 p-5 md:p-6"
          >
            <p className="text-sm leading-relaxed text-ink/75">
              <span className="mr-2 text-lg">💌</span>
              Need something personal — a question, a data export, or a deletion
              request? Tap the 
              <span className="font-semibold text-cherry">Bamboo Desk</span> 
              bubble (bottom right). It builds a staff ticket you can copy to
              Discord or email.
            </p>
          </motion.div>

          <div className="mt-14 space-y-12 md:space-y-16">
            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">1. Pull up a stool — the agreement 🐼</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">By browsing Panda Bites, opening My Profile, filling a basket, pinging chefs, or using staff tools, you agree to these Terms and our Privacy Policy. If you are not ready to agree, leave the menu open in another tab and come back later — we will still be flipping virtual pancakes.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">These Terms cover our website, Discord-connected order flows, member features, and staff portals. Partner links (Seasonal Foods and friends) wear their own aprons and rules.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">2. The kitchen in plain language</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Panda Bites is a community Discord kitchen that helps you order adorable non-seasonal Bloxburg bites and points you toward seasonal specials when needed. You pay in Bloxburg dollars (B$). Real people deliver in-game.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We are fans and organizers — not Roblox, not official Bloxburg staff, and not a real-world restaurant with health inspectors. Virtual crumbs only.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Our job is menus, baskets, deals, profiles, and chef coordination. Your job is kindness, patience, and following platform rules while you play.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">3. Who may order (and who may wear the hat)</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Follow Roblox and Bloxburg conduct rules. Staff tools are only for accounts our admins have trusted with chef or admin roles.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">If your local law requires a parent or guardian for online services, involve them. We want a kitchen that feels safe for every age the platforms allow.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We may refuse service when someone repeatedly harasses the team, scams members, or tries to break the shop.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">4. Baskets, totals, and the little B$ dance</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Menu prices are in B$. Totals can rise with bulk or fast-service fees and fall with chef discounts or promo codes. Checkout previews are best guesses until a chef confirms what they can fulfill.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Payment runs through the Discord / in-game process the kitchen explains. This site is not a random real-money checkout unless we clearly add that later and spell it out.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">An order is a warm request, not a teleport spell. Timing depends on who is online, how busy Bloxburg feels, and how stacked the ticket is. Rush hour is real even in pixel kitchens.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">5. When delivery gets dramatic</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Chefs try hard. Lags, privacy settings, full servers, or sudden disconnects can slow a drop-off. We cannot control Roblox weather.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">If something goes wrong, talk to staff in Discord with your order details. Soft voices resolve tickets faster than all-caps monologues.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We or a chef may pause, adjust, or cancel orders that look impossible, abusive, mistaken, or against these Terms.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">6. Deals, codes, and not breaking the jar</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Promo codes and automatic discounts are gifts from the kitchen or individual chefs. They can expire, run out, or change without a parade.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Private staff codes are not for public billboards. Stacking tricks that violate posted deal rules may cancel an order and, if repeated, pause shop access.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">7. My Profile — the sticker book</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Optional profiles show rewards, perks, and history tied to a username you look up. Keep submissions honest.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Profiles are a convenience feature, not a bank, passport, or promise of infinite free snacks. See the Privacy Policy for how that data is handled.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">8. Chefs, admins, and shiny keys</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Kitchen roles come with trust. Do not snoop for sport, leak tickets, or use tools to bully. Admins may change or revoke access anytime.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Skippe and other helpers are power tools. Humans remain responsible for what actually changes in the kitchen.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">9. House manners</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Please do not harass members or staff, spam or scrape our systems, bypass roles or payment expectations, upload harmful content, or impersonate Panda Bites.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Security testing without permission is not a cute prank. Report bugs to staff instead of throwing spaghetti at production.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">10. Skippe, the AI sous-chef</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Staff may use Skippe to draft actions, set fees, or sort chores. AI can be confidently wrong. Double-check important changes.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Never paste passwords, private DMs, or extra personal data into AI prompts. The sous-chef does not need your life story to adjust a bulk fee.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">11. Content and branding</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Panda Bites original branding, layout, and copy on this site belong to the kitchen project. Roblox, Bloxburg, and other marks belong to their owners.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Please do not clone the shop wholesale or resell our tooling as your own franchise without permission.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">12. Third-party stages</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Discord, Roblox, Bloxburg, hosting providers, and AI gateways are third parties. Their outages, bans, and rule changes can affect your experience. We are not their customer-support desk for platform-wide issues.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">13. As-is, said with a bow</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We offer the service as a community convenience. Features may change, break, or nap during updates. We do not promise perfect uptime, perfect AI, or five-minute fulfillment on every craving.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Virtual items and B$ exist only inside third-party worlds with their own physics and policies.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">14. Liability limits</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">To the fullest extent the law allows, Panda Bites and its volunteers are not liable for indirect or consequential damages, lost B$, lost items, or data hiccups from the site, Discord, Roblox, or Bloxburg.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">If a court says a particular limit cannot apply, the rest of these Terms still stand like a well-built counter.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">15. Suspension and goodbyes</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">You may stop using the site anytime. We may suspend access for repeated harm to the kitchen or breaches of these Terms.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Sections that should survive goodbye (like liability limits) will survive.</p>
            </FadeSection>

            <FadeSection>
              <h2 className="font-display text-2xl md:text-3xl">16. Changes to the rule menu</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We may update these Terms as the shop grows. The date at the top is your crumb trail. Keeping the oven on after a change means you accept the new batch.</p>
            </FadeSection>

            <FadeSection>
              <SoftCard>
              <h2 className="font-display text-2xl md:text-3xl">17. Talk to Bamboo Desk</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">Questions? Use the floating Bamboo Desk button on this page to ask staff-facing questions, request a data export, or request deletion. You can also reach the official Panda Bites Discord.</p>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">We are a community kitchen — replies may take time during rush hour, but we do not intentionally compost your notes.</p>
              </SoftCard>
            </FadeSection>

            <FadeSection>
              <SoftCard>
                <h2 className="font-display text-2xl md:text-3xl">
                  Still curious?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink/80">
                  Read how we handle information in our 
                  <Link
                    to="/privacy"
                    className="font-medium text-cherry underline decoration-cherry/30 underline-offset-4"
                  >
                    Privacy Policy
                  </Link>
                  , or open Bamboo Desk for a living, breathing follow-up.
                </p>
              </SoftCard>
            </FadeSection>
          </div>
        </div>
      </main>

      <SupportAgentFab page="terms" />
      <SiteFooter />
    </div>
  );
}
