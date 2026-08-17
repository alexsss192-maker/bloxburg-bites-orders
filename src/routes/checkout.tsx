import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { placeOrder, previewOrder } from "@/lib/orders.functions";
import { getPriorityLevels, getCartChefs, type PriorityLevel } from "@/lib/members.functions";
import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, ShoppingBag } from "lucide-react";

const BULK_PREF_KEY = "pb_preferred_bulk_chef";

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
  const [discord, setDiscord] = useState("");
  const [note, setNote] = useState("");
  const [promoCode, setPromoCode] = useState("");

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

  const displayTotal = pickTotal(
    pricing,
    total,
  );

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
          },
        });

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

      toast.success(
        "Order placed — message your chef on Discord for payment and delivery.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (orderId) {
    return (
      <SuccessPanel
        orderId={orderId}
        onView={() =>
          navigate({
            to: "/order/$id",
            params: {
              id: orderId,
            },
          })
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">
          Checkout
        </p>

        <h1 className="mt-2 font-display text-5xl">
          Almost hungry.
        </h1>

        {items.length === 0 &&
        !orderId ? (
          <EmptyBasket />
        ) : (
          <>
            <Progress
              stepIndex={stepIndex}
            />

            <div className="mt-8 grid gap-8 md:grid-cols-[1.1fr_1fr]">
              <div className="relative min-h-[360px] overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                <AnimatePresence mode="wait">
                  {step ===
                    "review" && (
                    <StepPanel key="review">
                      <ReviewStep
                        promoCode={promoCode}
                        setPromoCode={setPromoCode}
                        pricing={pricing}
                        pricingLoading={pricingLoading}
                        priorityOptions={priorityOptions}
                        priorityPicks={priorityPicks}
                        setPriorityPicks={setPriorityPicks}
                        displayTotal={displayTotal}
                      />

                      <StepFooter
                        primaryLabel="Continue"
                        onPrimary={() =>
                          setStep(
                            "details",
                          )
                        }
                        primaryDisabled={
                          !canProceedReview
                        }
                        showBack={
                          false
                        }
                      />
                    </StepPanel>
                  )}

                  {step ===
                    "details" && (
                    <StepPanel key="details">
                      <DetailsStep
                        discord={
                          discord
                        }
                        setDiscord={
                          setDiscord
                        }
                        note={note}
                        setNote={
                          setNote
                        }
                      />

                      <StepFooter
                        primaryLabel="Review order"
                        onPrimary={() =>
                          setStep(
                            "confirm",
                          )
                        }
                        primaryDisabled={
                          !canProceedDetails
                        }
                        onBack={() =>
                          setStep(
                            "review",
                          )
                        }
                      />
                    </StepPanel>
                  )}

                  {step ===
                    "confirm" && (
                    <StepPanel key="confirm">
                      <ConfirmStep
                        discord={
                          discord
                        }
                        note={note}
                        total={
                          displayTotal
                        }
                        discount={
                          displayDiscount
                        }
                        bulkServiceFee={
                          bulkServiceFee
                        }
                      />

                      <StepFooter
                        primaryLabel={
                          submitting
                            ? "Placing order…"
                            : `Place order · B$${displayTotal.toLocaleString()}`
                        }
                        onPrimary={
                          submit
                        }
                        primaryDisabled={
                          submitting
                        }
                        loading={
                          submitting
                        }
                        onBack={() =>
                          setStep(
                            "details",
                          )
                        }
                      />
                    </StepPanel>
                  )}
                </AnimatePresence>
              </div>

              <BasketSummary
                pricing={pricing}
                displayTotal={
                  displayTotal
                }
                bulkServiceFee={
                  bulkServiceFee
                }
              />
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
      initial={{
        opacity: 0,
        y: 10,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      className="mt-10 rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center"
    >
      <div className="text-6xl">
        🥟
      </div>

      <p className="mt-4 font-display text-3xl">
        Your basket is empty.
      </p>

      <p className="mt-2 text-muted-foreground">
        Pick something delicious from the menu.
      </p>

      <Link
        to="/menu"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry"
      >
        <ShoppingBag className="h-4 w-4" />
        Go to the menu
      </Link>
    </motion.div>
  );
}

function Progress({
  stepIndex,
}: {
  stepIndex: number;
}) {
  return (
    <div className="mt-8 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const active =
          i === stepIndex;

        const done =
          i < stepIndex;

        return (
          <div
            key={s.id}
            className="flex flex-1 items-center gap-2"
          >
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
              {done ? (
                <Check className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </motion.div>

            <div className="flex flex-1 items-center gap-2">
              <span
                className={`text-xs uppercase tracking-widest ${
                  active
                    ? "text-cherry"
                    : done
                      ? "text-bamboo"
                      : "text-ink/40"
                }`}
              >
                {s.label}
              </span>

              {i <
                STEPS.length -
                  1 && (
                <div className="h-px flex-1 bg-ink/10">
                  <motion.div
                    className="h-px bg-cherry"
                    initial={false}
                    animate={{
                      scaleX: done
                        ? 1
                        : 0,
                    }}
                    style={{
                      transformOrigin:
                        "left",
                    }}
                    transition={{
                      duration: 0.3,
                    }}
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

function StepPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        x: 20,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: -20,
      }}
      transition={{
        duration: 0.25,
      }}
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
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      ) : (
        <span />
      )}

      <Button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-6 text-base text-cream hover:bg-cherry disabled:opacity-50"
      >
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}

        {primaryLabel}

        {!loading && (
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        )}
      </Button>
    </div>
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
}: {
  promoCode: string;
  setPromoCode: (value: string) => void;
  pricing: PricingResult | null;
  pricingLoading: boolean;
  priorityOptions: PriorityLevel[];
  priorityPicks: Record<string, "low" | "mid" | "high">;
  setPriorityPicks: (next: Record<string, "low" | "mid" | "high">) => void;
  displayTotal: number;
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

      {(pricing?.priority_bs ??
        0) > 0 && (
        <p className="mt-3 text-sm text-cherry">
          Priority: +B$
          {(
            pricing?.priority_bs ??
            0
          ).toLocaleString()}
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
              setNote(
                e.target.value,
              )
            }
            maxLength={500}
            placeholder="Timezone, preferred pickup window, …"
            className="mt-2"
          />

          {note.includes(
            "Preferred bulk chef",
          ) ||
          note.includes(
            "normal chef for bulk",
          ) ? (
            <p className="mt-1.5 text-xs text-cherry">
              Bulk preference from your cart choice is included above.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConfirmStep({
  discord,
  note,
  total,
  discount,
  bulkServiceFee,
}: {
  discord: string;
  note: string;
  total: number;
  discount: number;
  bulkServiceFee: number;
}) {
  const items = useCart(
    (s) => s.items,
  );

  return (
    <div className="flex-1 space-y-4">
      <p className="text-xs uppercase tracking-[0.3em] text-cherry">
        Step 3
      </p>

      <h2 className="mt-1 font-display text-3xl">
        Ready to send it?
      </h2>

      <div className="rounded-2xl border border-border/60 bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/60">
            Discord
          </span>

          <span className="font-medium">
            @{discord}
          </span>
        </div>

        <div className="mt-2 flex justify-between">
          <span className="text-ink/60">
            Items
          </span>

          <span>
            {items.length}
          </span>
        </div>

        {discount > 0 && (
          <div className="mt-2 flex justify-between text-bamboo">
            <span>Savings</span>

            <span>
              −B$
              {discount.toLocaleString()}
            </span>
          </div>
        )}

        {bulkServiceFee > 0 && (
          <div className="mt-2 flex justify-between text-cherry">
            <span>
              Bulk / Fast Service
            </span>

            <span>
              +B$
              {bulkServiceFee.toLocaleString()}
            </span>
          </div>
        )}

        <div className="mt-3 flex justify-between border-t border-ink/10 pt-3">
          <span className="text-ink/60">
            Total
          </span>

          <span className="font-display text-lg">
            B$
            {total.toLocaleString()}
          </span>
        </div>

        {note && (
          <div className="mt-3 border-t border-ink/10 pt-3">
            <span className="text-xs uppercase tracking-widest text-ink/40">
              Note
            </span>

            <p className="mt-1 whitespace-pre-wrap text-sm">
              {note}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-cherry/10 p-4 text-sm text-ink/80">
        Payment:{" "}
        <span className="font-semibold">
          Bloxburg Cash (B$)
        </span>{" "}
        — a chef will DM you shortly.
      </div>
    </div>
  );
}

function BasketSummary({
  pricing,
  displayTotal,
  bulkServiceFee,
}: {
  pricing: PricingResult | null;
  displayTotal: number;
  bulkServiceFee: number;
}) {
  const items = useCart(
    (s) => s.items,
  );

  return (
    <aside className="h-fit rounded-3xl border border-border/60 bg-white p-6 shadow-sm">
      <p className="font-display text-2xl">
        Your basket
      </p>

      <ul className="mt-4 space-y-3">
        {items.map((i) => (
          <li
            key={i.menu_item_id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex-1">
              <span className="font-medium">
                {i.name}
              </span>

              <span className="text-muted-foreground">
                {" "}
                × {i.quantity}
              </span>
            </span>

            <span className="tabular-nums">
              B$
              {(
                i.price_bs *
                i.quantity
              ).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      {pricing &&
        pricing.subtotal_bs >
          0 && (
          <div className="mt-6 space-y-2 border-t border-border/60 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/60">
                Subtotal
              </span>

              <span>
                B$
                {pricing.subtotal_bs.toLocaleString()}
              </span>
            </div>

            {pricing.discount_bs >
              0 && (
              <div className="flex justify-between text-bamboo">
                <span>
                  Savings
                </span>

                <span>
                  −B$
                  {pricing.discount_bs.toLocaleString()}
                </span>
              </div>
            )}

            {(pricing.priority_bs ??
              0) > 0 && (
              <div className="flex justify-between text-cherry">
                <span>
                  Priority
                </span>

                <span>
                  +B$
                  {(
                    pricing.priority_bs ??
                    0
                  ).toLocaleString()}
                </span>
              </div>
            )}

            {bulkServiceFee >
              0 && (
              <div className="flex items-center justify-between rounded-xl bg-cherry/5 px-3 py-2 text-cherry">
                <span className="font-medium">
                  Bulk / Fast Service
                </span>

                <span className="font-semibold">
                  +B$
                  {bulkServiceFee.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

      <div className="mt-4 flex items-baseline justify-between border-t border-border/60 pt-4">
        <span className="text-sm uppercase tracking-widest text-muted-foreground">
          Total
        </span>

        <span className="font-display text-3xl">
          B$
          {displayTotal.toLocaleString()}
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

function SuccessPanel({
  orderId,
  onView,
}: {
  orderId: string;
  onView: () => void;
}) {
  const [copied, setCopied] =
    useState(false);

  const link = useMemo(
    () =>
      typeof window !==
      "undefined"
        ? `${window.location.origin}/order/${orderId}`
        : `/order/${orderId}`,
    [orderId],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        link,
      );

      setCopied(true);

      toast.success(
        "Link copied",
      );

      setTimeout(
        () =>
          setCopied(false),
        1600,
      );
    } catch {
      toast.error(
        "Couldn't copy — long-press to copy manually",
      );
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
            A chef will DM you in Discord to confirm payment and delivery.
          </p>

          <div className="mt-6 rounded-2xl bg-blossom/60 px-4 py-3 text-left">
            <p className="text-[0.65rem] uppercase tracking-widest text-ink/50">
              Order ID
            </p>

            <p className="mt-1 break-all font-mono text-sm">
              {orderId}
            </p>
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
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}

              {copied
                ? "Copied!"
                : "Copy link"}
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
