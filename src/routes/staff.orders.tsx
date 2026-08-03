import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { listOrders, updateOrderStatus } from "@/lib/menu.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/staff/orders")({
  head: () => ({ meta: [{ title: "Orders — Panda Bites Staff" }, { name: "robots", content: "noindex" }] }),
  component: OrdersPage,
});

const STATUSES = ["pending", "preparing", "ready", "delivered", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

const statusBadge: Record<string, string> = {
  pending: "bg-ink/10 text-ink",
  preparing: "bg-cherry/10 text-cherry",
  ready: "bg-bamboo/15 text-bamboo",
  delivered: "bg-ink text-cream",
  cancelled: "bg-destructive/10 text-destructive",
};

function OrdersPage() {
  const listFn = useServerFn(listOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["staff-orders"], queryFn: () => listFn() });
  const mut = useMutation({
    mutationFn: (v: { id: string; status: Status }) => updateFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-orders"] }); toast.success("Status updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (isLoading) return <p className="text-muted-foreground">Loading orders...</p>;
  const orders = data?.orders ?? [];
  const items = data?.items ?? [];
  const fulfillments = data?.fulfillments ?? [];

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Kitchen</p>
        <h1 className="mt-1 font-display text-4xl">Orders queue</h1>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-10 text-center text-muted-foreground">No orders yet.</div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence>
            {orders.map((o) => {
              const its = items.filter((i) => i.order_id === o.id);
              const portions = fulfillments.filter((f) => f.order_id === o.id);
              const open = expanded.has(o.id);
              return (
                <motion.li key={o.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-border bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl">@{o.discord_username}</p>
                      <p className="text-xs text-muted-foreground">#{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`border-transparent ${statusBadge[o.status] ?? "bg-ink/10 text-ink"}`}>Order · {o.status}</Badge>
                      <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(o.id)) next.delete(o.id); else next.add(o.id); return next; })}>
                        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                    <span className="text-xs uppercase tracking-widest text-ink/50">{its.length} item{its.length === 1 ? "" : "s"}</span>
                    <span className="font-display text-2xl tabular-nums">B${o.total_bs.toLocaleString()}</span>
                  </div>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <ul className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                          {its.map((i, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>{i.item_name} × {i.quantity}</span>
                              <span className="text-muted-foreground tabular-nums">B${(i.unit_price_bs * i.quantity).toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-4 space-y-2">
                          {portions.map((portion) => (
                            <div key={portion.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-blossom p-3">
                              <span className="text-sm font-medium">Your portion · B${portion.total_bs.toLocaleString()}</span>
                              <select
                                value={portion.status}
                                onChange={(e) => mut.mutate({ id: portion.id, status: e.target.value as Status })}
                                className="rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium"
                              >
                                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                        {o.note && <p className="mt-3 rounded-2xl bg-secondary p-3 text-xs">Note: {o.note}</p>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
