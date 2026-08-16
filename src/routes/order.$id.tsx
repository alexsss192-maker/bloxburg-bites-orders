import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, PackageCheck, PackageX, Package } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getOrder, getStockByNames } from "@/lib/menu.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import pandaMascot from "@/assets/panda-mascot.png";

export const Route = createFileRoute("/order/$id")({
  head: () => ({
    meta: [
      { title: "Order confirmed — Panda Bites" },
      { name: "description", content: "Your Panda Bites order was placed." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["order", params.id],
      queryFn: () => getOrder({ data: { id: params.id } }),
    }),
  component: OrderPage,
});

function stockLabel(
  stock: number | undefined,
  active: boolean | undefined,
): { label: string; tone: string; Icon: typeof Package } {
  if (stock == null) return { label: "syncing…", tone: "text-ink/40", Icon: Package };
  if (!active || stock <= 0) return { label: "sold out", tone: "text-destructive", Icon: PackageX };
  if (stock <= 3) return { label: `${stock} left`, tone: "text-cherry", Icon: Package };
  return { label: "plenty in stock", tone: "text-bamboo", Icon: PackageCheck };
}

function OrderPage() {
  const { id } = Route.useParams();
  const { data: order } = useSuspenseQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder({ data: { id } }),
  });
  const stockFn = useServerFn(getStockByNames);
  const [stock, setStock] = useState<Record<string, { stock: number; is_active: boolean }>>({});

  useEffect(() => {
    const names = order.items.map((i) => i.item_name);
    if (names.length === 0) return;
    stockFn({ data: { names } }).then(setStock).catch(() => {});
  }, [order.items, stockFn]);

  function copyRef() {
    navigator.clipboard.writeText(`Panda Bites #${order.id.slice(0, 8)}`);
    toast.success("Copied — paste it in Discord");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream">
      <ConfettiBlossoms />
      <SiteHeader />
      <main className="relative mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[2rem] border border-border/60 bg-white shadow-[0_40px_100px_-40px_rgba(196,92,124,0.35)]"
          >
            <div className="relative flex items-center justify-between gap-4 bg-gradient-to-br from-blossom via-petal to-sakura/60 px-8 py-6">
              <div>
                <div className="flex items-center gap-2 text-bamboo">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="text-[0.65rem] uppercase tracking-[0.35em]">Order confirmed</p>
                </div>
                <p className="mt-1 font-display text-3xl leading-tight">
                  Thanks, {order.discord_username}!
                </p>
              </div>
              <motion.img
                src={pandaMascot}
                alt=""
                width={90}
                height={90}
                animate={{ rotate: [0, -6, 6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            <div className="px-8 py-6">
              <p className="text-sm text-muted-foreground">
                Reference{" "}
                <span className="font-mono text-ink">#{order.id.slice(0, 8)}</span> · status{" "}
                <span className="font-semibold text-ink">{order.status}</span>
                <button
                  onClick={copyRef}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink hover:bg-cherry hover:text-cream"
                >
                  <Copy className="h-3 w-3" /> copy
                </button>
              </p>

              <ul className="mt-6 divide-y divide-border/60">
                {order.items.map((i, idx) => {
                  const s = stockLabel(stock[i.item_name]?.stock, stock[i.item_name]?.is_active);
                  return (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div className="flex-1">
                        <p className="font-display text-lg leading-tight">
                          {i.item_name}
                          <span className="ml-2 text-sm text-muted-foreground">× {i.quantity}</span>
                        </p>
                        <p
                          className={`mt-0.5 flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.25em] ${s.tone}`}
                        >
                          <s.Icon className="h-3 w-3" /> {s.label}
                        </p>
                      </div>
                      <p className="font-semibold">
                        B${(i.unit_price_bs * i.quantity).toLocaleString()}
                      </p>
                    </motion.li>
                  );
                })}
              </ul>

              <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display text-3xl">B${order.total_bs.toLocaleString()}</span>
              </div>

              {order.cancel_reason && (
                <div className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                  <p className="font-semibold">Cancelled</p>
                  <p className="mt-1">{order.cancel_reason}</p>
                </div>
              )}

              {order.note && (
                <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm">
                  <span className="font-semibold">Your note: </span>
                  {order.note}
                </div>
              )}

              <div className="mt-8 rounded-2xl bg-petal p-4 text-sm text-ink/80">
                Message your chef on <b>Discord</b> to agree on B$ payment and in-game delivery time.
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/menu"
                  className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry"
                >
                  Order more
                </Link>
                <Link
                  to="/history"
                  className="inline-flex rounded-full border border-ink/15 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-blossom"
                >
                  View my orders
                </Link>
                <Button
                  onClick={() => window.print()}
                  variant="ghost"
                  className="rounded-full text-ink hover:bg-blossom"
                >
                  Print receipt
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm lg:sticky lg:top-24 lg:self-start lg:h-fit">
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">Contact</p>
          <h2 className="mt-1 font-display text-2xl">Message your chef on Discord</h2>
          <p className="mt-2 text-sm text-ink/60">
            In-app order chat is off to keep the kitchen fast. DM your chef on Discord (username on
            this order) to arrange B$ payment and delivery.
          </p>
        </div>
      </main>
    </div>
  );
}

function ConfettiBlossoms() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      {[...Array(18)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-2 w-2 rounded-full bg-cherry/60"
          initial={{ y: -30, x: `${(i * 71) % 100}%`, opacity: 0 }}
          animate={{ y: "110vh", opacity: [0, 1, 0.4, 0] }}
          transition={{ duration: 4 + (i % 4), delay: i * 0.15, ease: "easeIn", repeat: 0 }}
          style={{
            background:
              i % 3 === 0 ? "hsl(340 60% 75%)" : i % 3 === 1 ? "hsl(350 80% 68%)" : "hsl(30 90% 88%)",
          }}
        />
      ))}
    </div>
  );
}
