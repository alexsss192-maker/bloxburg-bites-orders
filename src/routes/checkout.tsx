import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { placeVerifiedOrder, previewVerifiedOrder } from "@/lib/verify.functions";
import { useVerifiedSession } from "@/lib/use-verified-session";
import { useCart } from "@/lib/cart-store";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, ShoppingBag } from "lucide-react";

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

type Step = "review" | "details" | "confirm";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "review", label: "Basket" },
  { id: "details", label: "Details" },
  { id: "confirm", label: "Confirm" },
];

function CheckoutPage() {
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);
  const session = useVerifiedSession();
  const [step, setStep] = useState<Step>("review");
  const [discord, setDiscord] = useState("");
  const [note, setNote] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [pricing, setPricing] = useState<{ subtotal_bs: number; discount_bs: number; total_bs: number; discounts: Array<{ name: string; savings_bs: number }> } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const navigate = useNavigate();
  const placeOrderFn = useServerFn(placeVerifiedOrder);
  const previewOrderFn = useServerFn(previewVerifiedOrder);

  useEffect(() => {
    if (session?.username) setDiscord(session.username);
  }, [session?.username]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canProceedReview = items.length > 0;
  const canProceedDetails = discord.trim().length >= 2;

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setPricingLoading(true);
      previewOrderFn({ data: { items: items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })), promo_code: promoCode.trim() || null } })
        .then((result) => { if (!cancelled) setPricing(result); })
        .catch(() => { if (!cancelled) setPricing(null); })
        .finally(() => { if (!cancelled) setPricingLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [items, promoCode, previewOrderFn]);

  async function submit() {
    if (items.length === 0) return;
    if (discord.trim().length < 2) {
      toast.error("Enter your Discord username");
      return;
    }
    setSubmitting(true);
    try {
      const res = await placeOrderFn({
        data: {
          discord_username: discord.trim(),
          note: note.trim() || null,
          items: items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
           promo_code: promoCode.trim() || null,
        },
      });
      setOrderId(res.order_id);
      clear();
      toast.success("Order placed! Our chefs will DM you.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (orderId) return <SuccessPanel orderId={orderId} onView={() => navigate({ to: "/order/$id", params: { id: orderId } })} />;

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Checkout</p>
        <h1 className="mt-2 font-display text-5xl">Almost hungry.</h1>

        {items.length === 0 && !orderId ? (
          <EmptyBasket />
        ) : (
          <>
            <Progress stepIndex={stepIndex} />
            <div className="mt-8 grid gap-8 md:grid-cols-[1.1fr_1fr]">
              <div className="relative min-h-[360px] overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                <AnimatePresence mode="wait">
                  {step === "review" && (
                    <StepPanel key="review">
                      <ReviewStep promoCode={promoCode} setPromoCode={setPromoCode} pricing={pricing} pricingLoading={pricingLoading} />
                      <StepFooter
                        primaryLabel="Continue"
                        onPrimary={() => setStep("details")}
                        primaryDisabled={!canProceedReview}
                        showBack={false}
                      />
                    </StepPanel>
                  )}
                  {step === "details" && (
                    <StepPanel key="details">
                      <DetailsStep
                        discord={discord}
                        setDiscord={setDiscord}
                        note={note}
                        setNote={setNote}
                        session={session}
                      />
                      <StepFooter
                        primaryLabel="Review order"
                        onPrimary={() => setStep("confirm")}
                        primaryDisabled={!canProceedDetails}
                        onBack={() => setStep("review")}
                      />
                    </StepPanel>
                  )}
                  {step === "confirm" && (
                    <StepPanel key="confirm">
                      <ConfirmStep discord={discord} note={note} total={pricing?.total_bs ?? total} discount={pricing?.discount_bs ?? 0} />
                      <StepFooter
                        primaryLabel={submitting ? "Placing order…" : `Place order · B$${(pricing?.total_bs ?? total).toLocaleString()}`}
                        onPrimary={submit}
                        primaryDisabled={submitting}
                        loading={submitting}
                        onBack={() => setStep("details")}
                      />
                    </StepPanel>
                  )}
                </AnimatePresence>
              </div>
              <BasketSummary pricing={pricing} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyBasket() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-10 rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center"
    >
      <div className="text-6xl">🥟</div>
      <p className="mt-4 font-display text-3xl">Your basket is empty.</p>
      <p className="mt-2 text-muted-foreground">Pick something delicious from the menu.</p>
      <Link
        to="/menu"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry"
      >
        <ShoppingBag className="h-4 w-4" /> Go to the menu
      </Link>
    </motion.div>
  );
}

function Progress({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="mt-8 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const active = i === stepIndex;
        const done = i < stepIndex;
        return (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <motion.div
              layout
              className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                done
                  ? "bg-bamboo text-cream"
                  : active
                    ? "bg-cherry text-cream ring-4 ring-cherry/20"
                    : "bg-ink/10 text-ink/50"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </motion.div>
            <div className="flex flex-1 items-center gap-2">
              <span
                className={`text-xs uppercase tracking-widest ${
                  active ? "text-cherry" : done ? "text-bamboo" : "text-ink/40"
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="h-px flex-1 bg-ink/10">
                  <motion.div
                    className="h-px bg-cherry"
                    initial={false}
                    animate={{ scaleX: done ? 1 : 0 }}
                    style={{ transformOrigin: "left" }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col"
    >
      {children}
    </motion.div>
  );
}

function StepFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled,
  onBack,
  showBack = true,
  loading = false,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  onBack?: () => void;
  showBack?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {showBack ? (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : (
        <span />
      )}
      <Button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-6 text-base text-cream hover:bg-cherry disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {primaryLabel}
        {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />}
      </Button>
    </div>
  );
}

function ReviewStep({ promoCode, setPromoCode, pricing, pricingLoading }: { promoCode: string; setPromoCode: (value: string) => void; pricing: { subtotal_bs: number; discount_bs: number; total_bs: number; discounts: Array<{ name: string; savings_bs: number }> } | null; pricingLoading: boolean }) {
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  return (
    <div className="flex-1">
      <p className="text-xs uppercase tracking-[0.3em] text-cherry">Step 1</p>
      <h2 className="mt-1 font-display text-3xl">Review your basket</h2>
      <p className="mt-1 text-sm text-ink/60">Make sure everything looks right before we contact you.</p>
      <ul className="mt-4 divide-y divide-border/60">
        {items.map((i) => (
          <li key={i.menu_item_id} className="flex items-center justify-between py-3 text-sm">
            <span>
              <span className="font-medium">{i.name}</span>
              <span className="text-muted-foreground"> × {i.quantity}</span>
            </span>
            <span className="tabular-nums font-medium">
              B${(i.price_bs * i.quantity).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Label htmlFor="promo">Promo code</Label>
        <Input id="promo" value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} maxLength={32} placeholder="Optional" className="mt-2 uppercase" />
        {pricing?.discounts?.length ? <p className="mt-2 text-sm text-bamboo">{pricing.discounts.map((discount) => `${discount.name}: −B$${discount.savings_bs.toLocaleString()}`).join(" · ")}</p> : null}
      </div>
      <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-blossom/60 px-4 py-3">
        <span className="text-xs uppercase tracking-widest text-ink/60">Estimated total</span>
        <span className="font-display text-2xl">{pricingLoading ? "…" : `B$${(pricing?.total_bs ?? total).toLocaleString()}`}</span>
      </div>
    </div>
  );
}

function DetailsStep({
  discord,
  setDiscord,
  note,
  setNote,
  session,
}: {
  discord: string;
  setDiscord: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  session: { username: string; avatar_url: string | null } | null;
}) {
  return (
    <div className="flex-1 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Step 2</p>
        <h2 className="mt-1 font-display text-3xl">How should we reach you?</h2>
      </div>
      <div>
        <Label htmlFor="discord">Discord username</Label>
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-ink/10 bg-blossom/70 p-2 pr-4">
          {session?.avatar_url ? (
            <img src={session.avatar_url} alt="" className="h-10 w-10 rounded-xl ring-2 ring-cherry/40" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-cherry text-cream">🐼</span>
          )}
          <Input
            id="discord"
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            readOnly={!!session}
            maxLength={64}
            required
            className="h-10 flex-1 rounded-xl border-none bg-transparent shadow-none focus-visible:ring-0"
          />
          {session && (
            <span className="text-[0.65rem] uppercase tracking-[0.3em] text-cherry">Verified</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          A chef will DM you in the Panda Bites Discord to arrange B$ payment & delivery.
        </p>
      </div>
      <div>
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Any special requests? (allergies, delivery time, in-game username)"
          maxLength={500}
          className="mt-2 rounded-xl"
        />
        <p className="mt-1 text-right text-[0.65rem] uppercase tracking-widest text-ink/40">
          {note.length}/500
        </p>
      </div>
    </div>
  );
}

function ConfirmStep({ discord, note, total, discount }: { discord: string; note: string; total: number; discount: number }) {
  const items = useCart((s) => s.items);
  return (
    <div className="flex-1 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Step 3</p>
        <h2 className="mt-1 font-display text-3xl">Ready to send it?</h2>
      </div>
      <div className="rounded-2xl border border-border/60 bg-blossom/40 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/60">Discord</span>
          <span className="font-medium">@{discord}</span>
        </div>
        <div className="mt-2 flex justify-between">
          <span className="text-ink/60">Items</span>
          <span className="font-medium">{items.length}</span>
        </div>
        {discount > 0 && <div className="mt-2 flex justify-between text-bamboo"><span>Savings</span><span>−B${discount.toLocaleString()}</span></div>}
        <div className="mt-2 flex justify-between">
          <span className="text-ink/60">Total</span>
          <span className="font-display text-lg">B${total.toLocaleString()}</span>
        </div>
        {note && (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <span className="text-xs uppercase tracking-widest text-ink/40">Note</span>
            <p className="mt-1 whitespace-pre-wrap text-sm">{note}</p>
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-cherry/10 p-4 text-sm text-ink/80">
        Payment: <span className="font-semibold">Bloxburg Cash (B$)</span> — a chef will DM you shortly.
      </div>
    </div>
  );
}

function BasketSummary({ pricing }: { pricing: { subtotal_bs: number; discount_bs: number; total_bs: number } | null }) {
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  return (
    <aside className="h-fit rounded-3xl border border-border/60 bg-white p-6 shadow-sm">
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
        <span className="font-display text-3xl">B${(pricing?.total_bs ?? total).toLocaleString()}</span>
      </div>
      {(pricing?.discount_bs ?? 0) > 0 && <p className="mt-2 text-right text-sm text-bamboo">You save B${pricing?.discount_bs.toLocaleString()}</p>}
    </aside>
  );
}

function SuccessPanel({ orderId, onView }: { orderId: string; onView: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/order/${orderId}` : `/order/${orderId}`),
    [orderId],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  }
  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto grid max-w-2xl place-items-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="w-full rounded-3xl border border-border/60 bg-white p-10 text-center shadow-xl"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 15 }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-bamboo/20 text-4xl"
          >
            🎉
          </motion.div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-cherry">Order placed</p>
          <h1 className="mt-2 font-display text-4xl">Your bag is on the way.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A chef will DM you in Discord to confirm payment and delivery.
          </p>
          <div className="mt-6 rounded-2xl bg-blossom/60 px-4 py-3 text-left">
            <p className="text-[0.65rem] uppercase tracking-widest text-ink/50">Order ID</p>
            <p className="mt-1 font-mono text-sm break-all">{orderId}</p>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={onView}
              className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry"
            >
              View receipt
            </button>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-blossom"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <Link to="/menu" className="mt-4 inline-block text-xs uppercase tracking-widest text-cherry hover:text-ink">
            Order more →
          </Link>
        </motion.div>
      </main>
    </div>
  );
}