export function SiteFooter() {
  return (
    <footer className="mt-16 bg-ink text-cream/80 sm:mt-24">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-8 sm:gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-3xl leading-none text-cream sm:text-4xl">
              Panda Bites
            </p>

            <p className="mt-3 max-w-sm text-sm leading-relaxed text-cream/60">
              A Discord kitchen serving Bloxburg&apos;s cutest non-seasonal and
              seasonal bites. Pay in B$, delivered in-game by our chef team.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cream/50">
              Shop
            </p>

            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="/menu" className="inline-block py-0.5 hover:text-cream">
                  Non-seasonal menu
                </a>
              </li>
              <li>
                <a href="/deals" className="inline-block py-0.5 hover:text-cream">
                  Deals & promo codes
                </a>
              </li>
              <li>
                <a href="/me" className="inline-block py-0.5 hover:text-cream">
                  My Profile
                </a>
              </li>
              <li>
                <a
                  href="/history"
                  className="inline-block py-0.5 hover:text-cream"
                >
                  Order history
                </a>
              </li>
              <li>
                <a
                  href="/checkout"
                  className="inline-block py-0.5 hover:text-cream"
                >
                  Basket
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cream/50">
              Partner
            </p>

            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href="https://seasonalfoods.lovable.app/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block py-0.5 hover:text-cream"
                >
                  Seasonal Foods ↗
                </a>
              </li>
            </ul>

            <p className="mt-8 text-xs uppercase tracking-[0.25em] text-cream/50">
              Legal
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="/terms" className="inline-block py-0.5 hover:text-cream">
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className="inline-block py-0.5 hover:text-cream"
                >
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cream/50">
              The kitchen
            </p>

            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="/staff" className="inline-block py-0.5 hover:text-cream">
                  Staff portal
                </a>
              </li>
              <li className="text-cream/60">
                Chefs online: paying attention 🐼
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-cream/10 pt-6 text-[11px] uppercase tracking-widest text-cream/50 sm:mt-12 sm:text-xs md:flex-row md:items-center">
          <p>© 2026 Panda Bites · Discord community shop</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="/terms" className="hover:text-cream">
              Terms
            </a>
            <a href="/privacy" className="hover:text-cream">
              Privacy
            </a>
            <span>Vol. 01 · The blossom issue</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
