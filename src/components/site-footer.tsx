export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink text-cream/80">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-4xl leading-none text-cream">Panda Bites</p>
            <p className="mt-3 max-w-sm text-sm text-cream/60">
              A Discord kitchen serving Bloxburg's cutest non-seasonal and seasonal bites. Pay in B$, delivered in-game
              by our chef team.
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cream/50">Shop</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="/menu" className="hover:text-cream">Non-seasonal menu</a></li>
              <li><a href="/menu" className="hover:text-cream">Seasonal menu</a></li>
              <li><a href="/checkout" className="hover:text-cream">Basket</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cream/50">Partner</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="https://seasonalfoods.lovable.app/" target="_blank" rel="noreferrer" className="hover:text-cream">Seasonal Foods ↗</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cream/50">The kitchen</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a href="/staff" className="hover:text-cream">Staff portal</a></li>
              <li className="text-cream/60">Chefs online: paying attention 🐼</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-cream/10 pt-6 text-xs uppercase tracking-widest text-cream/50 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Panda Bites · Discord community shop</p>
          <p>Vol. 01 · The blossom issue</p>
        </div>
      </div>
    </footer>
  );
}
