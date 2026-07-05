import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import pandaMascot from "@/assets/panda-mascot.png";

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const total = useCart((s) => s.total());
  const count = useCart((s) => s.count());
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-blossom via-cream to-petal text-ink shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
          >
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sakura/30 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -left-20 top-1/2 h-56 w-56 rounded-full bg-petal/40 blur-3xl" />

            <div className="relative flex items-center justify-between border-b border-ink/10 px-6 py-6">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.35em] text-cherry">Your basket</p>
                <h2 className="mt-1 font-display text-3xl leading-none">
                  {count > 0 ? (<>{count} <span className="italic text-cherry">bites</span></>) : "Empty basket"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-ink/10 bg-blossom/70 p-2 text-ink/70 shadow-sm transition hover:bg-ink hover:text-cream"
                aria-label="Close cart"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto px-6 py-5">
              {items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="flex h-full flex-col items-center justify-center text-center"
                >
                  <motion.img
                    src={pandaMascot} alt="" width={160} height={160}
                    className="mb-5 drop-shadow-[0_20px_25px_rgba(196,92,124,0.25)]"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <p className="font-display text-2xl">Nothing here yet</p>
                  <p className="mt-1 max-w-[16rem] text-sm text-ink/60">
                    Fill it with sweet non-seasonal bites — the panda's patient.
                  </p>
                </motion.div>
              ) : (
                <ul className="space-y-3.5">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.li
                        key={item.menu_item_id}
                        layout
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 60, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        className="group flex gap-4 rounded-2xl border border-ink/5 bg-blossom/90 p-3 shadow-[0_10px_25px_-15px_rgba(196,92,124,0.35)] backdrop-blur-sm transition hover:border-cherry/30"
                      >
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-petal/40 ring-1 ring-inset ring-ink/5">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl">🍰</div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-lg leading-tight">{item.name}</p>
                            <button
                              onClick={() => remove(item.menu_item_id)}
                              className="text-ink/40 transition hover:rotate-12 hover:text-destructive"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-[0.65rem] uppercase tracking-[0.3em] text-cherry/80">
                            B${item.price_bs.toLocaleString()} · each
                          </p>
                          <div className="mt-auto flex items-center justify-between">
                            <div className="flex items-center gap-1 rounded-full border border-ink/10 bg-cream p-0.5 shadow-inner">
                              <button
                                className="flex h-7 w-7 items-center justify-center rounded-full text-ink transition hover:bg-ink hover:text-cream"
                                onClick={() => setQty(item.menu_item_id, item.quantity - 1)}
                                aria-label="Decrease"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-7 text-center font-display text-base tabular-nums">{item.quantity}</span>
                              <button
                                className="flex h-7 w-7 items-center justify-center rounded-full text-ink transition hover:bg-ink hover:text-cream disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink"
                                onClick={() => setQty(item.menu_item_id, item.quantity + 1)}
                                disabled={item.quantity >= item.max_stock}
                                aria-label="Increase"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="font-display text-lg tabular-nums">
                              B${(item.price_bs * item.quantity).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            <motion.div layout className="relative border-t border-ink/10 bg-gradient-to-b from-blossom/90 to-cream px-6 py-5">
              <div className="mb-3 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-ink/50">
                <span>Subtotal · {count} item{count === 1 ? "" : "s"}</span>
                <span className="text-cherry">Paid in B$</span>
              </div>
              <div className="mb-5 flex items-baseline justify-between">
                <span className="font-display text-2xl">Total</span>
                <motion.span
                  key={total}
                  initial={{ scale: 0.9, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="font-display text-4xl text-ink"
                >
                  B$<span className="tabular-nums">{total.toLocaleString()}</span>
                </motion.span>
              </div>
              <motion.div whileHover={{ scale: items.length ? 1.01 : 1 }} whileTap={{ scale: items.length ? 0.99 : 1 }}>
                <Button
                  className="group relative w-full overflow-hidden rounded-full bg-ink py-7 text-base font-semibold text-cream shadow-[0_18px_40px_-18px_rgba(196,92,124,0.85)] transition hover:bg-cherry disabled:opacity-40 disabled:shadow-none"
                  disabled={items.length === 0}
                  onClick={() => { onClose(); navigate({ to: "/checkout" }); }}
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cream/25 to-transparent transition duration-700 group-hover:translate-x-full" />
                  <Sparkles className="mr-2 h-5 w-5" />
                  Proceed to checkout
                  <ArrowRight className="ml-2 h-5 w-5 transition group-hover:translate-x-1" />
                </Button>
              </motion.div>
              <p className="mt-3 text-center text-[0.7rem] uppercase tracking-[0.3em] text-ink/40">
                Chef DMs you on Discord to finish payment
              </p>
            </motion.div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}