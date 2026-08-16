import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { listOrders, updateOrderStatus, cancelFulfillment } from "@/lib/menu.functions";
import { isBulkSizedOrder, traysFromCount } from "@/lib/bulk-department";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, Zap, Ban, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { StockAlertsPanel } from "@/components/stock-alerts-panel";


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

const RANK: Record<string, number> = { high: 3, mid: 2, low: 1 };

function priorityOf(order: { priority_tier: string | null }, portions: Array<{ priority_tier: string | null; priority_label: string | null; priority_color: string | null }>) {
  const mine = portions.find((p) => p.priority_tier);
  const tier = mine?.priority_tier ?? order.priority_tier ?? null;
  return {
    tier,
    rank: tier ? (RANK[tier] ?? 0) : 0,
    label: mine?.priority_label ?? null,
    color: mine?.priority_color ?? null,
  };
}

const HISTORY = new Set(["delivered", "cancelled"]);

function OrdersPage() {
  const listFn = useServerFn(listOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const cancelFn = useServerFn(cancelFulfillment);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["staff-orders"],
    queryFn: () => listFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Only reload after status mutations (invalidate), not on tab focus
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["staff-orders"] });
    qc.invalidateQueries({ queryKey: ["stock-alerts"] });
    qc.invalidateQueries({ queryKey: ["staff-menu"] });
  };
  const mut = useMutation({
    mutationFn: (v: { id: string; status: Status }) => updateFn({ data: v }),
    onSuccess: (_d, vars) => {
      refresh();
      if (vars.status === "delivered") {
        toast.success("Delivered — leaves this queue after 7 days; customer keeps history");
      } else {
        toast.success("Status updated");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const [cancelling, setCancelling] = useState<{ id: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const cancelMut = useMutation({
    mutationFn: (v: { id: string; reason: string }) => cancelFn({ data: v }),
    onSuccess: () => {
      refresh();
      toast.success("Cancelled — items returned to stock");
      setCancelling(null);
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 20 first page; 40 after "See more". Persisted in localStorage. */
  const [showLimit, setShowLimit] = useState(20);

  // Staff UI prefs (local only — no server)
  useEffect(() => {
    try {
      window.localStorage.setItem("pb_staff_orders_show", String(showLimit));
      window.localStorage.setItem(
        "pb_staff_orders_expanded",
        JSON.stringify([...expanded].slice(0, 20)),
      );
    } catch {
      /* ignore */
    }
  }, [showLimit, expanded]);
  // Hydrate staff UI prefs + last opened order (local only — no server)
  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem("pb_staff_orders_show") ?? "20");
      if (v === 40) setShowLimit(40);
      const raw = window.localStorage.getItem("pb_staff_orders_expanded");
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setExpanded(new Set(arr.slice(0, 20)));
      }
      const id = window.localStorage.getItem("pb_staff_last_order");
      if (id) setExpanded((prev) => new Set(prev).add(id));
    } catch {
      /* ignore */
    }
  }, []);



  if (isLoading) return <p className="text-muted-foreground">Loading orders...</p>;
  const items = data?.items ?? [];
  const fulfillments = data?.fulfillments ?? [];

  const decorated = (data?.orders ?? []).map((o) => {
    const portions = fulfillments.filter((f) => f.order_id === o.id);
    const its = items.filter((i) => i.order_id === o.id);
    const qty = its.reduce((a, i) => a + i.quantity, 0);
    return {
      order: o,
      portions,
      priority: priorityOf(o, portions),
      qty,
      isBulk: isBulkSizedOrder(qty, o.total_bs),
      trays: traysFromCount(qty),
    };
  });
  const sortQueue = (a: typeof decorated[number], b: typeof decorated[number]) =>
    Number(b.isBulk) - Number(a.isBulk) ||
    b.priority.rank - a.priority.rank ||
    new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime();
  const active = decorated.filter((d) => !HISTORY.has(d.order.status)).sort(sortQueue);
  const history = decorated
    .filter((d) => HISTORY.has(d.order.status))
    .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());
  const allOrders = [...active, ...history];

  // Show 20 by default; "See more" expands to 40 (server max).
  const visible = allOrders.slice(0, showLimit);
  const canSeeMore = allOrders.length > 20 && showLimit < 40;
  const atCap = Boolean(data?.capped) || allOrders.length >= 40;

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Kitchen</p>
        <h1 className="mt-1 font-display text-4xl">Orders queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Orders with 4+ trays (84+ items) are flagged{" "}
          <span className="font-semibold text-cherry">BULK / FAST SERVICE</span>.
          Showing {visible.length} of up to 40. Delivered orders leave this list after 7 days
          (customers still keep them in their order history).
        </p>
      </div>

      {atCap && (
        <div className="mb-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>Queue limit reached.</strong> We can only show the top 40 chef-visible orders.
          Deliver older ones to make room — delivering moves them toward history, and after 7 days
          delivered orders drop off this kitchen list (they stay on the customer&apos;s history).
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-xs text-ink/60">
        Auto-cleanup: orders marked <strong>delivered</strong> (or cancelled) older than{" "}
        <strong>7 days</strong> are hidden here so the queue stays small. They are{" "}
        <strong>not</strong> removed from the member&apos;s order history.
      </div>

      <StockAlertsPanel className="mb-6" />
      {visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-10 text-center text-muted-foreground">No orders yet.</div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence>
            {visible.map(({ order: o, portions, priority, qty, isBulk, trays }) => {
              const its = items.filter((i) => i.order_id === o.id);
              const open = expanded.has(o.id);
              const hasPriority = priority.rank > 0;
              const color = priority.color ?? "#d94f5c";
              return (
                <motion.li
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`overflow-hidden rounded-3xl border bg-white p-5 ${
                    isBulk
                      ? "border-2 border-cherry shadow-sm"
                      : hasPriority
                        ? "border-2 shadow-sm"
                        : "border-border"
                  }`}
                  style={
                    isBulk
                      ? { borderColor: "#d94f5c", backgroundColor: "#d94f5c0d" }
                      : hasPriority
                        ? { borderColor: color, backgroundColor: `${color}0d` }
                        : undefined
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl">@{o.discord_username}</p>
                      <p className="text-xs text-muted-foreground">#{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isBulk && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cherry px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white">
                          <Package className="h-3 w-3" /> BULK · ~{trays} trays · {qty} items
                        </span>
                      )}
                      {hasPriority && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white"
                          style={{ backgroundColor: color }}
                        >
                          <Zap className="h-3 w-3" /> {priority.label ?? `${priority.tier} priority`}
                        </span>
                      )}
                      <Badge className={`border-transparent ${statusBadge[o.status] ?? "bg-ink/10 text-ink"}`}>Order · {o.status}</Badge>
                      <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.id)) next.delete(o.id);
                          else {
                            next.add(o.id);
                            try {
                              window.localStorage.setItem("pb_staff_last_order", o.id);
                            } catch {
                              /* ignore */
                            }
                          }
                          return next;
                        })}>
                        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                    <span className="text-xs uppercase tracking-widest text-ink/50">{its.length} line{its.length === 1 ? "" : "s"} · {qty} item{qty === 1 ? "" : "s"}</span>
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
                            <div key={portion.id} className="rounded-2xl border border-border bg-blossom p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                  Your portion · B${portion.total_bs.toLocaleString()}
                                  {portion.priority_price_bs > 0 && (
                                    <span className="text-ink/60"> (incl. B${portion.priority_price_bs.toLocaleString()} priority)</span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  <select
                                    value={portion.status}
                                    onChange={(e) => {
                                      const next = e.target.value as Status;
                                      if (next === "cancelled") {
                                        setReason("");
                                        setCancelling({ id: portion.id, label: `@${o.discord_username} · #${o.id.slice(0, 8)}` });
                                        return;
                                      }
                                      mut.mutate({ id: portion.id, status: next });
                                    }}
                                    disabled={portion.status === "cancelled"}
                                    className="rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium"
                                  >
                                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  {portion.status !== "cancelled" && portion.status !== "delivered" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="rounded-full text-destructive hover:bg-destructive/10"
                                      onClick={() => { setReason(""); setCancelling({ id: portion.id, label: `@${o.discord_username} · #${o.id.slice(0, 8)}` }); }}
                                    >
                                      <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {portion.cancel_reason && (
                                <p className="mt-2 rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
                                  Cancelled — reason: {portion.cancel_reason}
                                </p>
                              )}
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

      {canSeeMore && (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => setShowLimit(40)}
          >
            See more (show up to 40)
          </Button>
        </div>
      )}

      {showLimit >= 40 && allOrders.length >= 40 && (
        <p className="mt-3 text-center text-xs text-ink/50">
          Top 40 only. Deliver orders to free slots for newer ones.
        </p>
      )}

      <Dialog open={!!cancelling} onOpenChange={(v) => { if (!v) { setCancelling(null); setReason(""); } }}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl">Cancel this order?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink/60">
            {cancelling?.label} — the items in your portion go straight back into stock and the customer sees your reason in the order chat.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length < 3) { toast.error("Please write a short reason"); return; }
              if (cancelling) cancelMut.mutate({ id: cancelling.id, reason: reason.trim() });
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="cancel-reason">Cancellation reason</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Out of ingredients, customer never showed up, ..."
                className="mt-2"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={cancelMut.isPending}
              className="w-full rounded-full bg-destructive py-6 text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMut.isPending ? "Cancelling..." : "Cancel order & restock"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
