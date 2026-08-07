import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, MessageCircle, PackageCheck, PackageX, Package } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getOrder, getStockByNames } from "@/lib/menu.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import pandaMascot from "@/assets/panda-mascot.png";
import { OrderChat } from "@/components/order-chat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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

function stockLabel(stock: number | undefined, active: boolean | undefined): { label: string; tone: string; Icon: typeof Package } {
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
  const [chatOpen, setChatOpen] = useState(false);

  function scrollToChat() {
    document.getElementById("order-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    const key = `pb_chat_intro_${id}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable */
    }
    const t = setTimeout(() => setChatOpen(true), 600);
    return () => clearTimeout(t);
  }, [id]);

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
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-md rounded-[2rem] border border-border/60 bg-white p-8">
          <DialogHeader>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-petal text-cherry">
              <MessageCircle className="h-7 w-7" />
            </div>
            <DialogTitle className="text-center font-display text-3xl">You have a chat with your chef</DialogTitle>
            <DialogDescription className="text-center text-sm leading-relaxed">
              Finish your order right here — agree on a delivery time and B$ payment in the order chat instead of
              Discord DMs.
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              setChatOpen(false);
              setTimeout(scrollToChat, 150);
            }}
            className="mt-2 w-full rounded-2xl bg-ink py-6 text-base font-bold text-cream hover:bg-cherry"
          >
            Open the chat
          </Button>
          <button
            onClick={() => setChatOpen(false)}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/40 hover:text-ink"
          >
            Maybe later
          </button>
        </DialogContent>
      </Dialog>
      <main className="relative mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="lg:col-span-2">
          <button
            onClick={scrollToChat}
            className="flex w-full items-center gap-4 rounded-[2rem] border border-cherry/30 bg-petal px-6 py-5 text-left transition hover:border-cherry"
          >
            <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-white text-cherry">
              <MessageCircle className="h-6 w-6" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-xl leading-tight">Chat with your chef</span>
              <span className="block text-sm text-ink/60">
                Agree on your pickup time and B$ payment here — no Discord DMs needed.
              </span>
            </span>
            <span className="hidden rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream sm:block">
              Open chat
            </span>
          </button>
        </div>
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
              <p className="mt-1 font-display text-3xl leading-tight">Thanks, {order.discord_username}!</p>
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
            <p className="text-muted-foreground text-sm">
            Reference <span className="font-mono text-ink">#{order.id.slice(0, 8)}</span> · status{" "}
            <span className="font-semibold text-ink">{order.status}</span>
              <button onClick={copyRef} className="ml-2 inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink hover:bg-cherry hover:text-cream">
                <Copy className="h-3 w-3" /> copy
              </button>
          </p>
            <ul className="mt-6 divide-y divide-border/60">
            {order.items.map((i, idx) => (
              (() => {
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
                      <p className={`mt-0.5 flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.25em] ${s.tone}`}>
                        <s.Icon className="h-3 w-3" /> {s.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg tabular-nums">B${(i.unit_price_bs * i.quantity).toLocaleString()}</p>
                      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-ink/40">
                        B${i.unit_price_bs.toLocaleString()} each
                      </p>
                    </div>
                  </motion.li>
                );
              })()
            ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-border/60 pt-4">
            <span className="text-sm uppercase tracking-widest text-muted-foreground">Total</span>
            <span className="font-display text-3xl">B${order.total_bs.toLocaleString()}</span>
            </div>
          {order.note && (
            <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm">
              <span className="font-semibold">Your note: </span>{order.note}
            </div>
          )}
          <div className="mt-8 rounded-2xl bg-petal p-4 text-sm text-ink/80">
            Use the <b>order chat</b> to agree on your B$ payment and in-game delivery time with your chef.
          </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/menu" className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry">
                Order more
              </Link>
              <Link to="/history" className="inline-flex rounded-full border border-ink/15 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-blossom">
                View my orders
              </Link>
              <Button onClick={() => window.print()} variant="ghost" className="rounded-full text-ink hover:bg-blossom">
                Print receipt
              </Button>
            </div>
          </div>
        </motion.div>
        </div>

        <div id="order-chat" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <OrderChat orderId={order.id} authorName={order.discord_username} mode="customer" />
        </div>
      </main>

      {/* Always-reachable chat handle on small screens. */}
      <button
        onClick={scrollToChat}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-cream shadow-lg transition hover:bg-cherry lg:hidden"
      >
        <MessageCircle className="h-4 w-4" /> Chef chat
      </button>
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
          style={{ background: i % 3 === 0 ? "hsl(340 60% 75%)" : i % 3 === 1 ? "hsl(350 80% 68%)" : "hsl(30 90% 88%)" }}
        />
      ))}
    </div>
  );
}