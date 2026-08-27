import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Minus,
  Plus,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { useCart } from "@/lib/cart-store";
import {
  isBulkSizedOrder,
  bulkWarningCopy,
} from "@/lib/bulk-department";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const total = useCart((s) => s.total());
  const count = useCart((s) => s.count());
  const navigate = useNavigate();
  const [bulkWarnOpen, setBulkWarnOpen] = useState(false);

  const isBulk = isBulkSizedOrder(count, total);
  const copy = bulkWarningCopy(count);

  function goCheckout() {
    onClose();
    setBulkWarnOpen(false);
    navigate({ to: "/checkout" });
  }

  function onProceed() {
    if (isBulk) {
      setBulkWarnOpen(true);
      return;
    }
    goCheckout();
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />

            <motion.aside
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white text-ink shadow-xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              {/* Header — tight */}
              <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
                <h2 className="font-display text-xl">
                  Cart{count > 0 ? ` · ${count}` : ""}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-ink/50 hover:bg-ink/5 hover:text-ink"
                  aria-label="Close cart"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Lines */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {items.length === 0 ? (
                  <p className="py-16 text-center text-sm text-ink/50">
                    Your cart is empty.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink/8">
                    {items.map((item) => (
                      <li
                        key={item.menu_item_id}
                        className="flex gap-3 py-3"
                      >
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-ink/5">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-lg">
                              🍰
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium">
                              {item.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => remove(item.menu_item_id)}
                              className="shrink-0 text-ink/30 hover:text-destructive"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-xs text-ink/45">
                            B${item.price_bs.toLocaleString()} each
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="inline-flex items-center rounded-full border border-ink/10">
                              <button
                                type="button"
                                className="px-2 py-1 text-ink/70 hover:text-ink"
                                onClick={() =>
                                  setQty(item.menu_item_id, item.quantity - 1)
                                }
                                aria-label="Decrease"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                className="px-2 py-1 text-ink/70 hover:text-ink disabled:opacity-30"
                                onClick={() =>
                                  setQty(item.menu_item_id, item.quantity + 1)
                                }
                                disabled={item.quantity >= item.max_stock}
                                aria-label="Increase"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="text-sm font-medium tabular-nums">
                              B$
                              {(item.price_bs * item.quantity).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-ink/10 px-4 py-4">
                {isBulk && (
                  <p className="mb-3 flex items-start gap-1.5 text-xs text-cherry">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Large order (~{copy.trays} trays) — you can review at checkout.
                  </p>
                )}
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm text-ink/60">Total</span>
                  <span className="font-display text-2xl tabular-nums">
                    B${total.toLocaleString()}
                  </span>
                </div>
                <Button
                  type="button"
                  className="w-full rounded-full bg-ink py-6 text-sm font-semibold text-cream hover:bg-cherry disabled:opacity-40"
                  disabled={items.length === 0}
                  onClick={onProceed}
                >
                  Checkout
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
                <p className="mt-2 text-center text-[0.65rem] text-ink/40">
                  Pay in B$ via Discord with your chef
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Dialog open={bulkWarnOpen} onOpenChange={setBulkWarnOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-cherry">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="pt-1 text-left text-sm text-ink/70">
              {copy.body}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-ink/50">
              Choose delivery speed:
            </p>

            <button
              onClick={() => {
                sessionStorage.removeItem(
                  "pb_bulk_fast_service",
                );
                goCheckout();
              }}
              className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:bg-blossom"
            >
              <p className="font-semibold">
                Normal delivery
              </p>
              <p className="mt-1 text-xs text-ink/60">
                Standard processing
              </p>
            </button>

            <button
              onClick={() => {
                sessionStorage.setItem(
                  "pb_bulk_fast_service",
                  "true",
                );
                goCheckout();
              }}
              className="w-full rounded-2xl border-2 border-cherry bg-cherry/5 p-4 text-left transition hover:bg-cherry/10"
            >
              <p className="font-semibold text-cherry">
                ⚡ Fast service
              </p>
              <p className="mt-1 text-xs text-ink/60">
                Priority processing (additional fee applies)
              </p>
            </button>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setBulkWarnOpen(false)}
            >
              Adjust cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
