import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { placeOrder, previewOrder } from "@/lib/orders.functions";
import { getPriorityLevels, getCartChefs, type PriorityLevel } from "@/lib/members.functions";
import { useQuery } from "@tanstack/react-query";
import { Heart, Zap } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import {
  activeTipOptions,
  computeTipBs,
  formatTipOption,
  loadTipOptions,
  type TipOption,
} from "@/lib/tips";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, ShoppingBag } from "lucide-react";

const BULK_PREF_KEY = "pb_preferred_bulk_chef";

type CartItem = {
  menu_item_id: string;
  name: string;
  price_bs: number;
  image_url: string | null;
  quantity: number;
  max_stock: number;
};

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

/** Prefer server total only when it is a real positive amount; otherwise use cart total. */
function pickTotal(
  pricing: { total_bs: number } | null | undefined,
  cartTotal: number,
): number {
  if (pricing && Number(pricing.total_bs) > 0) {
    return Number(pricing.total_bs);
  }

  return cartTotal;
}

type PricingResult = {
  subtotal_bs: number;
  discount_bs: number;
  priority_bs?: number;
  bulk_service_bs?: number;
  bulk_fee_message?: string | null;
  total_bs: number;
  discounts: Array<{
    name: string;
    savings_bs: number;
  }>;
};

const DEFAULT_BULK_FEE_MESSAGE =
  "Bulk / Fast Service handles large orders in a dedicated kitchen lane so they finish faster. This fee covers that capacity. Adding priority (High/Mid/Low) on top makes your order even faster in the queue.";


function getBulkServiceFee(
  pricing: PricingResult | null,
): number {
  if (!pricing) return 0;

  /*
   * Newer preview RPCs return bulk_service_bs directly.
   *
   * The fallback also understands the temporary representation where
   * Bulk / Fast Service may have been returned inside discounts.
   */
  const direct = Number(pricing.bulk_service_bs ?? 0);

  if (direct > 0) {
    return direct;
  }

  const bulkEntry = pricing.discounts?.find(
    (discount) =>
      discount.name
        .toLowerCase()
        .includes("bulk / fast service"),
  );

  return Number(bulkEntry?.savings_bs ?? 0);
}

function getNormalDiscounts(
  pricing: PricingResult | null,
) {
  if (!pricing) return [];

  return pricing.discounts.filter(
    (discount) =>
      !discount.name
        .toLowerCase()
        .includes("bulk / fast service"),
  );
}

function CheckoutPage() {
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);

  const [step, setStep] = useState<Step>("review");
  const [stepDir, setStepDir] = useState<1 | -1>(1);
  const [discord, setDiscord] = useState("");
  const [note, setNote] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [tipOptions, setTipOptions] = useState<TipOption[]>([]);
  const [selectedTipId, setSelectedTipId] = useState<string | null>(null);

  const [pricing, setPricing] =
    useState<PricingResult | null>(null);

  const [priorityPicks, setPriorityPicks] = useState<
    Record<string, "low" | "mid" | "high">
  >({});

  const [pricingLoading, setPricingLoading] = useState(items.length > 0);

  const [submitting, setSubmitting] =
    useState(false);

  const [orderId, setOrderId] =
    useState<string | null>(null);

  /** Snapshot for Discord copy — cart is cleared after place order. */
  const [receipt, setReceipt] = useState<{
    discord: string;
    note: string;
    total_bs: number;
    lines: Array<{ name: string; quantity: number; price_bs: number }>;
  } | null>(null);

  const navigate = useNavigate();

  const placeOrderFn =
    useServerFn(placeOrder);

  const previewOrderFn =
    useServerFn(previewOrder);

  const priorityLevelsFn =
    useServerFn(getPriorityLevels);

  const cartChefsFn =
    useServerFn(getCartChefs);

  const itemIds = items.map(
    (i) => i.menu_item_id,
  );

  const { data: priorityLevels } = useQuery({
    queryKey: ["priority-levels"],
    queryFn: () => priorityLevelsFn(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: cartChefs } = useQuery({
    queryKey: ["cart-chefs", itemIds.join(",")],
    queryFn: () =>
      cartChefsFn({
        data: { menu_item_ids: itemIds },
      }),
    enabled: itemIds.length > 0,
    staleTime: 5 * 60_000,
  });

  // Only active tiers that belong to chefs in the current cart appear.
  // Missing low/mid/high means the chef has not saved them yet (Staff → Priority
  // now auto-seeds any missing tiers on first visit).
  const priorityOptions = useMemo(() => {
    const owners = new Set(cartChefs ?? []);

    return (priorityLevels ?? []).filter(
      (level) => owners.has(level.owner_id) && level.price_bs >= 0,
    );
  }, [priorityLevels, cartChefs]);

  const prioritySelection = useMemo(
    () =>
      Object.entries(
        priorityPicks,
      ).map(
        ([owner_id, tier]) => ({
          owner_id,
          tier,
        }),
      ),
    [priorityPicks],
  );

  // Calculate total priority cost from selected levels
  const totalPriorityCost = useMemo(() => {
    let sum = 0;
    for (const level of priorityOptions) {
      if (priorityPicks[level.owner_id] === level.tier) {
        sum += level.price_bs;
      }
    }
    return sum;
  }, [priorityOptions, priorityPicks]);

  const displayTotal = pickTotal(
    pricing,
    total,
  );

  const activeTips = useMemo(
    () => activeTipOptions(tipOptions),
    [tipOptions],
  );

  const selectedTip = useMemo(
    () => activeTips.find((t) => t.id === selectedTipId) ?? null,
    [activeTips, selectedTipId],
  );

  // Tip is calculated on the food subtotal (before priority) for % tips.
  const tipBaseBs = useMemo(() => {
    if (pricing && Number(pricing.subtotal_bs) > 0) {
      return Math.max(
        0,
        Number(pricing.subtotal_bs) - Number(pricing.discount_bs ?? 0),
      );
    }
    return total;
  }, [pricing, total]);

  const tipBs = useMemo(() => {
    if (!selectedTip) return 0;
    return computeTipBs(selectedTip.tip_type, selectedTip.tip_value, tipBaseBs);
  }, [selectedTip, tipBaseBs]);

  // Priority + tip always affect the visible total when the server omitted them.
  const finalTotal = useMemo(() => {
    const serverPriorityCost = Number(pricing?.priority_bs ?? 0);
    const withPriority =
      serverPriorityCost > 0
        ? displayTotal
        : displayTotal + totalPriorityCost;
    return withPriority + tipBs;
  }, [displayTotal, pricing, totalPriorityCost, tipBs]);

  const displayPriorityCost =
    Number(pricing?.priority_bs ?? 0) > 0
      ? Number(pricing?.priority_bs ?? 0)
      : totalPriorityCost;

  const displayDiscount =
    pricing &&
    pricing.total_bs > 0
      ? pricing.discount_bs ?? 0
      : 0;

  const bulkServiceFee =
    getBulkServiceFee(pricing);

  const normalDiscounts =
    getNormalDiscounts(pricing);

  useEffect(() => {
    setTipOptions(loadTipOptions());
    try {
      const saved =
        window.localStorage.getItem(
          "pb_discord_username",
        );

      if (saved) {
        setDiscord(saved);
      }
    } catch {
      /* storage unavailable */
    }

    // Prefill note from bulk warning popup choice (session only).
    try {
      const raw =
        window.sessionStorage.getItem(
          BULK_PREF_KEY,
        );

      if (raw) {
        const pref = JSON.parse(
          raw,
        ) as {
          username?: string;
          normal?: boolean;
          price_bs?: number;
        };

        if (pref.username) {
          const line =
            `Preferred bulk chef: @${pref.username}${
              pref.price_bs != null
                ? ` (portion ~B$${Number(
                    pref.price_bs,
                  ).toLocaleString()})`
                : ""
            }`;

          setNote((n) =>
            n.includes(
              "Preferred bulk chef",
            )
              ? n
              : n
                ? `${line}\n${n}`
                : line,
          );
        } else if (pref.normal) {
          const line =
            "Customer accepted normal chef for bulk-sized order.";

          setNote((n) =>
            n.includes(
              "normal chef for bulk",
            )
              ? n
              : n
                ? `${line}\n${n}`
                : line,
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const stepIndex =
    STEPS.findIndex(
      (s) => s.id === step,
    );

  const canProceedReview =
    items.length > 0;

  const canProceedDetails =
    discord.trim().length >= 2;

  // Auto-preview totals (promo, priority, bulk / fast service fee).
  // Debounced harder to cut preview_order_total RPC spam while typing.
  useEffect(() => {
    if (items.length === 0) {
      setPricing(null);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      setPricingLoading(true);
      previewOrderFn({
        data: {
          items: items.map((i) => ({
            menu_item_id: i.menu_item_id,
            quantity: i.quantity,
          })),
          promo_code: promoCode.trim() || null,
          username: discord.trim() || null,
          priority: prioritySelection,
        },
      })
        .then((result) => {
          if (!cancelled) setPricing(result as PricingResult);
        })
        .catch(() => {
          if (!cancelled) setPricing(null);
        })
        .finally(() => {
          if (!cancelled) setPricingLoading(false);
        });
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [items, promoCode, discord, prioritySelection, previewOrderFn]);

  async function submit() {
    if (items.length === 0) return;

    if (discord.trim().length < 2) {
      toast.error(
        "Enter your Discord username",
      );
      return;
    }

    setSubmitting(true);

    try {
      const snapshot = {
        discord: discord.trim(),
        note: note.trim(),
        total_bs: finalTotal,
        lines: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price_bs: i.price_bs,
        })),
      };

      const res =
        await placeOrderFn({
          data: {
            discord_username:
              discord.trim(),

            note:
              note.trim() || null,

            items: items.map((i) => ({
              menu_item_id:
                i.menu_item_id,
              quantity:
                i.quantity,
            })),

            promo_code:
              promoCode.trim() ||
              null,

            priority:
              prioritySelection,

            tip_bs: tipBs,
            tip_label: selectedTip
              ? formatTipOption(selectedTip)
              : null,
          },
        });

      setReceipt(snapshot);
      setOrderId(res.order_id);

      try {
        window.localStorage.setItem(
          "pb_discord_username",
          discord.trim(),
        );

        window.sessionStorage.removeItem(
          BULK_PREF_KEY,
        );
      } catch {
        /* storage unavailable */
      }

      clear();
      setStep("confirm");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Failed to place order",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">
              {stepIndex + 1} of {STEPS.length}
            </p>

            <h1 className="mt-1 font-display text-3xl md:text-4xl">
              {STEPS.find(
                (s) => s.id === step,
              )?.label}
            </h1>
          </div>

          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                disabled={
                  (s.id === "details" &&
                    !canProceedReview) ||
                  (s.id === "confirm" &&
                    !canProceedDetails)
                }
                className={`h-2 w-8 rounded-full transition ${
                  i <= stepIndex
                    ? "bg-cherry"
                    : "bg-ink/20"
                } disabled:cursor-not-allowed disabled:opacity-40`}
                aria-label={`Step ${i + 1}: ${s.label}`}
              />
            ))}
          </div>
        </div>

        {orderId && receipt ? (
          <SuccessPanel
            orderId={orderId}
            receipt={receipt}
            onView={() =>
              navigate({
                to: `/order/${orderId}`,
              })
            }
          />
        ) : (
          <div className="grid gap-8 md:grid-cols-[1fr_380px]">
            <div className="relative min-h-[12rem] overflow-hidden">
              <AnimatePresence mode="wait" custom={stepDir}>
                <motion.div
                  key={step}
                  custom={stepDir}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  variants={{
                    enter: (dir: 1 | -1) => ({
                      opacity: 0,
                      x: dir > 0 ? 28 : -28,
                      filter: "blur(4px)",
                    }),
                    center: {
                      opacity: 1,
                      x: 0,
                      filter: "blur(0px)",
                      transition: {
                        type: "spring",
                        stiffness: 320,
                        damping: 28,
                      },
                    },
                    exit: (dir: 1 | -1) => ({
                      opacity: 0,
                      x: dir > 0 ? -20 : 20,
                      filter: "blur(4px)",
                      transition: { duration: 0.18 },
                    }),
                  }}
                >
                  {step === "review" && (
                    <ReviewStep
                      promoCode={promoCode}
                      setPromoCode={setPromoCode}
                      pricing={pricing}
                      pricingLoading={pricingLoading}
                      priorityOptions={priorityOptions}
                      priorityPicks={priorityPicks}
                      setPriorityPicks={setPriorityPicks}
                      displayTotal={finalTotal}
                      displayPriorityCost={displayPriorityCost}
                      activeTips={activeTips}
                      selectedTipId={selectedTipId}
                      setSelectedTipId={setSelectedTipId}
                      tipBs={tipBs}
                      tipBaseBs={tipBaseBs}
                    />
                  )}

                  {step === "details" && (
                    <DetailsStep
                      discord={discord}
                      setDiscord={setDiscord}
                      note={note}
                      setNote={setNote}
                    />
                  )}

                  {step === "confirm" && (
                    <ConfirmStep
                      items={items}
                      discord={discord}
                      note={note}
                      total={finalTotal}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <PricingSidebar
              pricing={pricing}
              bulkServiceFee={bulkServiceFee}
              displayDiscount={displayDiscount}
              normalDiscounts={normalDiscounts}
              displayTotal={finalTotal}
              displayPriorityCost={displayPriorityCost}
              tipBs={tipBs}
              pricingLoading={pricingLoading}
            />
          </div>
        )}

        {!orderId && step === "confirm" && (
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => {
                setStepDir(-1);
                setStep("details");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-blossom disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <button
              onClick={submit}
              disabled={
                submitting ||
                items.length === 0
              }
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Placing order…
                </>
              ) : (
                <>
                  Place order
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}

        {!orderId && (
          <div className="mt-8 flex gap-3">
            {step !== "review" && (
              <button
                onClick={() => {
                  const index =
                    STEPS.findIndex(
                      (s) => s.id === step,
                    );

                  if (index > 0) {
                    setStepDir(-1);
                    setStep(
                      STEPS[index - 1]
                        .id,
                    );
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-blossom"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}

            {step !== "confirm" && (
              <button
                onClick={() => {
                  const index =
                    STEPS.findIndex(
                      (s) => s.id === step,
                    );

                  const canProceed =
                    (step === "review" &&
                      canProceedReview) ||
                    (step ===
                      "details" &&
                      canProceedDetails);

                  if (
                    canProceed &&
                    index <
                      STEPS.length - 1
                  ) {
                    setStepDir(1);
                    setStep(
                      STEPS[index + 1]
                        .id,
                    );
                  }
                }}
                disabled={
                  (step === "review" &&
                    !canProceedReview) ||
                  (step === "details" &&
                    !canProceedDetails)
                }
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ConfirmStep({
  items,
  discord,
  note,
  total,
}: {
  items: CartItem[];
  discord: string;
  note: string;
  total: number;
}) {
  return (
    <div className="flex-1">
      <p className="text-xs uppercase tracking-[0.3em] text-cherry">
        Step 3
      </p>

      <h2 className="mt-1 font-display text-3xl">
        Order details
      </h2>

      <p className="mt-1 text-sm text-ink/60">
        Review everything one last time.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-border/60 bg-white p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink/50">
            Discord
          </p>

          <p className="mt-1 font-semibold">
            {discord}
          </p>
        </div>

        {note && (
          <div>
            <p className="text-xs uppercase tracking-widest text-ink/50">
              Note
            </p>

            <p className="mt-1 whitespace-pre-wrap text-sm">
              {note}
            </p>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-widest text-ink/50">
            Items
          </p>

          <ul className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <li
                key={
                  i.menu_item_id
                }
              >
                {i.name} × {i.quantity}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-blossom/60 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-ink/60">
            Total
          </span>

          <span className="font-display text-2xl">
            B$
            {total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function PricingSidebar({
  pricing,
  bulkServiceFee,
  displayDiscount,
  normalDiscounts,
  displayTotal,
  displayPriorityCost,
  tipBs,
  pricingLoading,
}: {
  pricing: PricingResult | null;
  bulkServiceFee: number;
  displayDiscount: number;
  normalDiscounts: Array<{
    name: string;
    savings_bs: number;
  }>;
  displayTotal: number;
  displayPriorityCost: number;
  tipBs: number;
  pricingLoading: boolean;
}) {
  return (
    <aside className="rounded-2xl border border-border/60 bg-white p-6">
      <div className="text-xs uppercase tracking-widest text-ink/50">
        Pricing breakdown
      </div>

      <div className="mt-4 space-y-2 text-sm">
        {pricing && pricing.total_bs > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="text-ink/60">Subtotal</span>
              <span>B${pricing.subtotal_bs.toLocaleString()}</span>
            </div>
            {pricing.discount_bs > 0 && (
              <div className="flex justify-between text-bamboo">
                <span>Savings</span>
                <span>−B${pricing.discount_bs.toLocaleString()}</span>
              </div>
            )}
          </>
        ) : null}

        {displayPriorityCost > 0 && (
          <div className="flex justify-between text-cherry">
            <span>Priority</span>
            <span>+B${displayPriorityCost.toLocaleString()}</span>
          </div>
        )}

        {tipBs > 0 && (
          <div className="flex justify-between text-cherry">
            <span>Tip</span>
            <span>+B${tipBs.toLocaleString()}</span>
          </div>
        )}

        {bulkServiceFee > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-cherry/5 px-3 py-2 text-cherry">
            <span className="font-medium">Bulk / Fast Service</span>
            <span className="font-semibold">
              +B${bulkServiceFee.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-border/60 pt-4">
        <span className="text-sm uppercase tracking-widest text-muted-foreground">
          Total
        </span>

        <span className="font-display text-3xl">
          B$
          {pricingLoading ? "…" : displayTotal.toLocaleString()}
        </span>
      </div>

      {bulkServiceFee > 0 && (
        <p className="mt-2 text-right text-xs text-cherry">
          Includes Bulk / Fast Service
        </p>
      )}

      {(pricing?.discount_bs ??
        0) > 0 &&
        pricing &&
        pricing.total_bs > 0 && (
          <p className="mt-2 text-right text-sm text-bamboo">
            You save B$
            {pricing.discount_bs.toLocaleString()}
          </p>
        )}
    </aside>
  );
}

function ReviewStep({
  promoCode,
  setPromoCode,
  pricing,
  pricingLoading,
  priorityOptions,
  priorityPicks,
  setPriorityPicks,
  displayTotal,
  displayPriorityCost,
  activeTips,
  selectedTipId,
  setSelectedTipId,
  tipBs,
  tipBaseBs,
}: {
  promoCode: string;
  setPromoCode: (value: string) => void;
  pricing: PricingResult | null;
  pricingLoading: boolean;
  priorityOptions: PriorityLevel[];
  priorityPicks: Record<string, "low" | "mid" | "high">;
  setPriorityPicks: (next: Record<string, "low" | "mid" | "high">) => void;
  displayTotal: number;
  displayPriorityCost: number;
  activeTips: TipOption[];
  selectedTipId: string | null;
  setSelectedTipId: (id: string | null) => void;
  tipBs: number;
  tipBaseBs: number;
}) {
  const items = useCart(
    (s) => s.items,
  );

  const bulkServiceFee =
    getBulkServiceFee(pricing);

  const normalDiscounts =
    getNormalDiscounts(pricing);

  return (
    <div className="flex-1">
      <p className="text-xs uppercase tracking-[0.3em] text-cherry">
        Step 1
      </p>

      <h2 className="mt-1 font-display text-3xl">
        Review your basket
      </h2>

      <p className="mt-1 text-sm text-ink/60">
        Make sure everything looks right before we contact you.
      </p>

      <ul className="mt-4 divide-y divide-border/60">
        {items.map((i) => (
          <li
            key={i.menu_item_id}
            className="flex items-center justify-between py-3 text-sm"
          >
            <span>
              <span className="font-medium">
                {i.name}
              </span>

              <span className="text-muted-foreground">
                {" "}
                × {i.quantity}
              </span>
            </span>

            <span className="tabular-nums font-medium">
              B$
              {(
                i.price_bs *
                i.quantity
              ).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Label htmlFor="promo">
          Promo code
        </Label>

        <Input
          id="promo"
          value={promoCode}
          onChange={(event) =>
            setPromoCode(
              event.target.value.toUpperCase(),
            )
          }
          maxLength={32}
          placeholder="Optional"
          className="mt-2 uppercase"
        />

        {normalDiscounts.length ? (
          <p className="mt-2 text-sm text-bamboo">
            {normalDiscounts
              .map(
                (discount) =>
                  `${discount.name}: −B$${discount.savings_bs.toLocaleString()}`,
              )
              .join(" · ")}
          </p>
        ) : null}
      </div>

      <PriorityPicker
        options={priorityOptions}
        picks={priorityPicks}
        setPicks={
          setPriorityPicks
        }
      />

      {displayPriorityCost > 0 && (
        <p className="mt-3 text-sm text-cherry">
          Priority: +B${displayPriorityCost.toLocaleString()}
        </p>
      )}

      {bulkServiceFee > 0 && (
        <div
          className="group relative mt-4 rounded-2xl border border-cherry/20 bg-cherry/5 px-4 py-3"
          title={pricing?.bulk_fee_message?.trim() || DEFAULT_BULK_FEE_MESSAGE}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-cherry underline decoration-dotted decoration-cherry/40 underline-offset-2">
                Bulk / Fast Service fee
              </p>
              <p className="mt-0.5 text-xs text-ink/55">
                Hover for details · priority on top = even faster
              </p>
            </div>
            <span className="font-semibold text-cherry">
              +B${bulkServiceFee.toLocaleString()}
            </span>
          </div>
          <div className="pointer-events-none absolute left-0 right-0 top-full z-20 mt-2 hidden rounded-2xl border border-cherry/20 bg-white p-3 text-xs leading-relaxed text-ink/80 shadow-lg group-hover:block">
            {pricing?.bulk_fee_message?.trim() || DEFAULT_BULK_FEE_MESSAGE}
          </div>
        </div>
      )}

      {/* Tip jar */}
      {activeTips.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border/60 bg-white p-4">
          <div className="flex items-start gap-2">
            <Heart className="mt-0.5 h-4 w-4 shrink-0 text-cherry" />
            <div>
              <p className="font-semibold text-ink">Tip jar</p>
              <p className="mt-0.5 text-xs text-ink/55">
                Optional — goes straight to your chef. Tap again to clear.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {activeTips.map((opt) => {
              const amount = computeTipBs(
                opt.tip_type,
                opt.tip_value,
                tipBaseBs,
              );
              const selected = selectedTipId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setSelectedTipId(selected ? null : opt.id)
                  }
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-cherry bg-cherry/10 shadow-sm"
                      : "border-border/60 bg-cream/40 hover:border-cherry/40 hover:bg-petal/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">
                    {formatTipOption(opt)}
                  </p>
                  <p className="mt-1 text-xs text-ink/55">
                    +B${amount.toLocaleString()}
                  </p>
                </button>
              );
            })}
          </div>
          {tipBs > 0 && (
            <p className="mt-2 text-sm text-cherry">
              Tip: +B${tipBs.toLocaleString()}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-blossom/60 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-ink/60">
            Estimated total
          </span>

          <span className="font-display text-2xl">
            {pricingLoading
              ? "…"
              : `B$${displayTotal.toLocaleString()}`}
          </span>
        </div>

        {bulkServiceFee > 0 && (
          <p className="mt-1 text-right text-xs text-ink/50">
            Includes Bulk / Fast Service
          </p>
        )}
      </div>
    </div>
  );
}

function PriorityPicker({
  options,
  picks,
  setPicks,
}: {
  options: PriorityLevel[];
  picks: Record<string, "low" | "mid" | "high">;
  setPicks: (next: Record<string, "low" | "mid" | "high">) => void;
}) {
  if (options.length === 0) return null;

  const byChef = new Map<string, PriorityLevel[]>();
  for (const level of options) {
    const arr = byChef.get(level.owner_id) ?? [];
    arr.push(level);
    byChef.set(level.owner_id, arr);
  }

  const order = { low: 0, mid: 1, high: 2 } as const;

  return (
    <div className="mt-6 rounded-2xl border border-border/60 bg-petal/40 p-4">
      <p className="flex items-center gap-1.5 font-display text-xl">
        <Zap className="h-4 w-4 text-cherry" />
        Skip the queue?
      </p>
      <p className="mt-1 text-xs text-ink/60">
        Buy priority with B$ and your chef bumps your order up the queue. Panda Reward
        priority is applied for free — the higher one always wins.
      </p>

      {Array.from(byChef.entries()).map(([ownerId, levels]) => {
        const sorted = [...levels].sort(
          (a, b) => (order[a.tier] ?? 9) - (order[b.tier] ?? 9),
        );
        const current = picks[ownerId] ?? "";
        const selected = sorted.find((l) => l.tier === current);

        return (
          <div key={ownerId} className="mt-4">
            <p className="text-xs uppercase tracking-widest text-ink/50">
              @{sorted[0]?.chef_username ?? "chef"}
              {sorted[0]?.is_admin ? " · admin kitchen" : ""}
            </p>

            <label className="mt-2 block">
              <span className="sr-only">Priority level</span>
              <select
                value={current}
                onChange={(e) => {
                  const value = e.target.value as "" | "low" | "mid" | "high";
                  const next = { ...picks };
                  if (!value) {
                    delete next[ownerId];
                  } else {
                    next[ownerId] = value;
                  }
                  setPicks(next);
                }}
                className="mt-1.5 w-full appearance-none rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-ink shadow-sm outline-none ring-cherry/30 focus:ring-2"
                style={
                  selected
                    ? { borderColor: selected.color, boxShadow: `0 0 0 1px ${selected.color}33` }
                    : undefined
                }
              >
                <option value="">No priority · free</option>
                {sorted.map((level) => (
                  <option key={level.tier} value={level.tier}>
                    {level.name} · B${level.price_bs.toLocaleString()} ({level.tier})
                  </option>
                ))}
              </select>
            </label>

            {selected && (
              <p className="mt-2 text-xs text-ink/60">
                <span
                  className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                  style={{ backgroundColor: selected.color }}
                />
                +B${selected.price_bs.toLocaleString()} at checkout for this
                kitchen
              </p>
            )}

            {sorted.length < 3 && (
              <p className="mt-1.5 text-xs text-ink/45">
                Only the tiers this kitchen has enabled are listed. The chef can
                turn on Low / Mid / High under Staff → Priority.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailsStep({
  discord,
  setDiscord,
  note,
  setNote,
}: {
  discord: string;
  setDiscord: (
    v: string,
  ) => void;
  note: string;
  setNote: (
    v: string,
  ) => void;
}) {
  return (
    <div className="flex-1">
      <p className="text-xs uppercase tracking-[0.3em] text-cherry">
        Step 2
      </p>

      <h2 className="mt-1 font-display text-3xl">
        Your details
      </h2>

      <p className="mt-1 text-sm text-ink/60">
        So the chef can find you on Discord.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <Label htmlFor="discord">
            Discord username
          </Label>

          <Input
            id="discord"
            value={discord}
            onChange={(e) =>
              setDiscord(
                e.target.value,
              )
            }
            placeholder="yourname"
            className="mt-2"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <Label htmlFor="note">
            Note for the chef (optional)
          </Label>

          <Textarea
            id="note"
            value={note}
            onChange={(e) =>
              setNote(e.target.value)
            }
            placeholder="e.g. Please deliver to Meadowbrook Park main gate"
            className="mt-2"
            rows={4}
          />
        </div>
      </div>
    </div>
  );
}

function buildDiscordOrderMessage(args: {
  orderId: string;
  link: string;
  receipt: {
    discord: string;
    note: string;
    total_bs: number;
    lines: Array<{ name: string; quantity: number; price_bs: number }>;
  } | null;
}): string {
  const shortId = args.orderId.slice(0, 8);
  const lines = args.receipt?.lines ?? [];
  const itemLines =
    lines.length > 0
      ? lines
          .map(
            (l) =>
              `• ${l.name} × ${l.quantity}${
                l.price_bs > 0
                  ? ` — B$${(l.price_bs * l.quantity).toLocaleString()}`
                  : ""
              }`,
          )
          .join("\n")
      : "• (see order link for items)";

  const total =
    args.receipt && args.receipt.total_bs > 0
      ? `B$${args.receipt.total_bs.toLocaleString()}`
      : "see receipt";

  const note =
    args.receipt?.note?.trim()
      ? `\nNote: ${args.receipt.note.trim()}`
      : "";

  const who = args.receipt?.discord?.trim() || "member";

  return [
    `Hi! New Panda Bites order 🐼`,
    `Order #${shortId}`,
    `Discord: ${who}`,
    ``,
    itemLines,
    ``,
    `Total: ${total}`,
    note,
    args.link ? `\nReceipt: ${args.link}` : "",
    ``,
    `Ready to pay in B$ — thanks!`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

function SuccessPanel({
  orderId,
  receipt,
  onView,
}: {
  orderId: string;
  receipt: {
    discord: string;
    note: string;
    total_bs: number;
    lines: Array<{ name: string; quantity: number; price_bs: number }>;
  } | null;
  onView: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "discord" | null>(null);

  const link = useMemo(
    () =>
      typeof window !== "undefined"
        ? `${window.location.origin}/order/${orderId}`
        : `/order/${orderId}`,
    [orderId],
  );

  const discordMessage = useMemo(
    () => buildDiscordOrderMessage({ orderId, link, receipt }),
    [orderId, link, receipt],
  );

  async function copyText(text: string, kind: "link" | "discord") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === "discord" ? "Discord message copied" : "Link copied");
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <main className="mx-auto grid max-w-2xl place-items-center px-6 py-16">
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.9,
          }}
          animate={{
            opacity: 1,
            scale: 1,
          }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
          className="w-full rounded-3xl border border-border/60 bg-white p-10 text-center shadow-xl"
        >
          <motion.div
            initial={{
              scale: 0,
            }}
            animate={{
              scale: 1,
            }}
            transition={{
              delay: 0.15,
              type: "spring",
              stiffness: 300,
              damping: 15,
            }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-bamboo/20 text-4xl"
          >
            🎉
          </motion.div>

          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-cherry">
            Order placed
          </p>

          <h1 className="mt-2 font-display text-4xl">
            Your bag is on the way.
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Copy the Discord message below and paste it to your chef to confirm payment and delivery.
          </p>

          <div className="mt-6 rounded-2xl bg-blossom/60 px-4 py-3 text-left">
            <p className="text-[0.65rem] uppercase tracking-widest text-ink/50">
              Order ID
            </p>

            <p className="mt-1 break-all font-mono text-sm">
              {orderId}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-left">
            <p className="text-[0.65rem] uppercase tracking-widest text-ink/50">
              Discord message
            </p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-ink/80">
              {discordMessage}
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => copyText(discordMessage, "discord")}
              className="inline-flex items-center gap-1.5 rounded-full bg-cherry px-6 py-3 text-sm font-semibold text-cream hover:bg-ink"
            >
              {copied === "discord" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied === "discord" ? "Copied!" : "Copy for Discord"}
            </button>

            <button
              onClick={onView}
              className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry"
            >
              View receipt
            </button>

            <button
              onClick={() => copyText(link, "link")}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-blossom"
            >
              {copied === "link" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied === "link" ? "Copied!" : "Copy link"}
            </button>
          </div>

          <Link
            to="/menu"
            className="mt-4 inline-block text-xs uppercase tracking-widest text-cherry hover:text-ink"
          >
            Order more →
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
