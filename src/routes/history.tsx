import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { listOrdersForUsername } from "@/lib/orders.functions";
import { SiteHeader } from "@/components/site-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, Receipt, Search } from "lucide-react";

const ORDER_STEPS = ["pending", "preparing", "ready", "delivered"];

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "My orders — Panda Bites" },
      { name: "description", content: "Every Panda Bites order you've placed with your Discord account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const listFn = useServerFn(listOrdersForUsername);
  const [input, setInput] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("pb_discord_username");
      if (saved) {
        setInput(saved);
        setUsername(saved);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["orders-by-username", username],
    queryFn: () => listFn({ data: { username } }),
    enabled: username.trim().length >= 2,
    // No interval — this page already has a manual "Refresh status"
    // button (uses `refetch` below), so the 30s auto-poll was pure
    // extra Lovable Cloud load on top of that.
  });

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    const next = input.trim();
    if (next.length < 2) return;
    setUsername(next);
    try {
      window.localStorage.setItem("pb_discord_username", next);
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="pb-eyebrow text-cherry">Order lookup</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="mt-2 font-display text-5xl">
            Every bite,
            <br />
            <span className="italic text-cherry">{username ? `@${username}` : "your orders"}</span>
          </h1>
          <Button
            onClick={() => refetch()}
            disabled={isFetching || username.trim().length < 2}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-ink hover:border-cherry hover:text-cherry disabled:opacity-50"
          >
            {isFetching ? "Refreshing…" : "Refresh status"}
          </Button>
        </div>

        <form onSubmit={lookup} className="pb-section mt-8 flex flex-wrap items-center gap-3 p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={64}
            placeholder="Your Discord username from checkout"
            className="h-12 flex-1 rounded-2xl border-border bg-background px-4"
          />
          <Button type="submit" className="pb-press h-12 rounded-2xl bg-accent px-6 font-bold text-accent-foreground hover:bg-sakura">
            <Search className="mr-2 h-4 w-4" /> Find my orders
          </Button>
        </form>

        {username.trim().length < 2 ? (
          <p className="mt-10 text-muted-foreground">
            Type the Discord username you used at checkout to see your orders and open each chat.
          </p>
        ) : isLoading ? (
          <p className="mt-10 text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-border bg-card p-16 text-center">
            <Receipt className="mx-auto h-10 w-10 text-cherry" />
            <p className="mt-4 font-display text-2xl">No orders for @{username}.</p>
            <p className="mt-1 text-muted-foreground">Check the spelling, or head to the menu and grab a bite.</p>
            <Link to="/menu" className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry">Browse menu</Link>
          </div>
        ) : (
          <ul className="mt-10 grid gap-4">
            {(data ?? []).map((o, idx) => (
              <motion.li
                key={o.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                 <div className="pb-section group p-5 transition hover:border-cherry/40">
                   <Link to="/order/$id" params={{ id: o.id }} className="flex items-center justify-between gap-4"><div>
                    <p className="text-[0.65rem] uppercase tracking-[0.3em] text-cherry">
                      {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                    </p>
                    <p className="mt-1 font-display text-2xl leading-tight">
                      #{o.id.slice(0, 8)}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {o.item_count} item{o.item_count === 1 ? "" : "s"} · {o.status}
                      </span>
                    </p>
                   </div>
                  <div className="flex items-center gap-3">
                     <div className="text-right">{o.discount_bs > 0 && <p className="text-xs text-bamboo">Saved B${o.discount_bs.toLocaleString()}</p>}<span className="font-display text-2xl tabular-nums">B${o.total_bs.toLocaleString()}</span></div>
                    <ArrowRight className="h-5 w-5 text-ink/40 transition group-hover:translate-x-1 group-hover:text-cherry" />
                  </div>
                   </Link>
                   <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border/60 pt-4">{ORDER_STEPS.map((step, stepIndex) => { const current = Math.max(0, ORDER_STEPS.indexOf(o.status)); const done = stepIndex <= current && o.status !== "cancelled"; return <div key={step}><div className={`h-1.5 rounded-full ${done ? "bg-cherry" : "bg-ink/10"}`} /><p className={`mt-1 text-[0.6rem] uppercase ${done ? "text-cherry" : "text-ink/40"}`}>{step}</p></div>; })}</div>
                   {(o.fulfillments?.length ?? 0) > 1 && <p className="mt-3 text-xs text-ink/55">{o.fulfillments.length} chef portions · {o.fulfillments.filter((portion) => portion.status === "ready" || portion.status === "delivered").length} ready</p>}
                 </div>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
