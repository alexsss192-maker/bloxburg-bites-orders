import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { placeOrder } from "@/lib/menu.functions";
import { useCart } from "@/lib/cart-store";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Panda Bites" },
      { name: "description", content: "Review your basket and place your Panda Bites order." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);
  const [discord, setDiscord] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const placeOrderFn = useServerFn(placeOrder);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    if (discord.trim().length < 2) { toast.error("Enter your Discord username"); return; }
    setSubmitting(true);
    try {
      const res = await placeOrderFn({ data: {
        discord_username: discord.trim(),
        note: note.trim() || null,
        items: items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
      }});
      clear();
      toast.success("Order placed! Our chefs will DM you.");
      navigate({ to: "/order/$id", params: { id: res.order_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Checkout</p>
        <h1 className="mt-2 font-display text-5xl">Almost hungry.</h1>

        {items.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
            <p className="font-display text-2xl">Your basket is empty.</p>
            <Link to="/menu" className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream hover:bg-cherry">Go to the menu</Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 md:grid-cols-[1.1fr_1fr]">
            <motion.form onSubmit={onSubmit} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-5 rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
              <div>
                <Label htmlFor="discord">Discord username</Label>
                <Input id="discord" value={discord} onChange={(e) => setDiscord(e.target.value)}
                  placeholder="e.g. Hellosavagesavage79" maxLength={64} required className="mt-2 h-12 rounded-xl" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Our chefs will DM you in the Panda Bites Discord to arrange B$ payment & delivery.
                </p>
              </div>
              <div>
                <Label htmlFor="note">Note (optional)</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Any special requests?" maxLength={500} className="mt-2 rounded-xl" />
              </div>
              <div className="rounded-2xl bg-cherry/10 p-4 text-sm text-ink/80">
                Payment method: <span className="font-semibold">Bloxburg Cash (B$)</span>. You'll be contacted in
                Discord to complete payment.
              </div>
              <Button disabled={submitting} type="submit"
                className="w-full rounded-full bg-ink py-6 text-base text-cream hover:bg-cherry disabled:opacity-60">
                {submitting ? "Placing order..." : `Place order · B$${total.toLocaleString()}`}
              </Button>
            </motion.form>

            <aside className="rounded-3xl border border-border/60 bg-white p-6 shadow-sm">
              <p className="font-display text-2xl">Your basket</p>
              <ul className="mt-4 space-y-3">
                {items.map((i) => (
                  <li key={i.menu_item_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex-1">
                      <span className="font-medium">{i.name}</span>
                      <span className="text-muted-foreground"> × {i.quantity}</span>
                    </span>
                    <span className="tabular-nums">B${(i.price_bs * i.quantity).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-baseline justify-between border-t border-border/60 pt-4">
                <span className="text-sm uppercase tracking-widest text-muted-foreground">Total</span>
                <span className="font-display text-3xl">B${total.toLocaleString()}</span>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}