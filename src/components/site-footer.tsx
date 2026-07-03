export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-ink text-cream/80">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-10 md:flex-row md:items-center">
        <div>
          <p className="font-display text-2xl text-cream">Panda Bites</p>
          <p className="text-sm text-cream/60">Bloxburg's coziest food shop. Pay in B$, delivered in-game.</p>
        </div>
        <p className="text-xs uppercase tracking-widest text-cream/60">
          © {new Date().getFullYear()} Panda Bites · Discord community shop
        </p>
      </div>
    </footer>
  );
}