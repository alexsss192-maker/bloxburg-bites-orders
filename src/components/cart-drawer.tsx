import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import pandaMascot from "@/assets/panda-mascot.png";

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const total = useCart((s) => s.total());
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-cream text-ink shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your basket</p>
                <h2 className="text-2xl font-display">Panda Bites</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-ink/70 transition hover:bg-ink/5 hover:text-ink"
                aria-label="Close cart"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <img src={pandaMascot} alt="" width={140} height={140} className="mb-4 opacity-90" />
                  <p className="font-display text-xl">Your basket is empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">Go add some tasty non-seasonal bites.</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {items.map((item) => (
                    <motion.li
                      key={item.menu_item_id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      className="flex gap-4 rounded-2xl border border-border/60 bg-card p-3 shadow-sm"
                    >
                      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl">🍰</div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-tight">{item.name}</p>
                          <button
                            onClick={() => remove(item.menu_item_id)}
                            className="text-muted-foreground transition hover:text-destructive"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-sm text-cherry">B${item.price_bs.toLocaleString()}</p>
                        <div className="mt-auto flex items-center justify-between">
                          <div className="flex items-center gap-1 rounded-full border border-border bg-background p-0.5">
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-ink/5"
                              onClick={() => setQty(item.menu_item_id, item.quantity - 1)}
                              aria-label="Decrease"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-ink/5 disabled:opacity-30"
                              onClick={() => setQty(item.menu_item_id, item.quantity + 1)}
                              disabled={item.quantity >= item.max_stock}
                              aria-label="Increase"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-sm font-semibold tabular-nums">
                            B${(item.price_bs * item.quantity).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border/60 bg-cream px-6 py-5">
              <div className="mb-4 flex items-baseline justify-between">
                <span className="text-sm uppercase tracking-widest text-muted-foreground">Total</span>
                <span className="font-display text-3xl text-ink">
                  B$<span className="tabular-nums">{total.toLocaleString()}</span>
                </span>
              </div>
              <Button
                className="w-full rounded-full bg-cherry py-6 text-base font-semibold text-cream hover:bg-cherry/90 disabled:opacity-40"
                disabled={items.length === 0}
                onClick={() => {
                  onClose();
                  navigate({ to: "/checkout" });
                }}
              >
                <ShoppingBag className="mr-2 h-5 w-5" /> Checkout
              </Button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}