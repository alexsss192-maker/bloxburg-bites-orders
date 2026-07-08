import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { listMyOrders } from "@/lib/verify.functions";
import { SiteHeader } from "@/components/site-header";
import { useVerifiedSession } from "@/components/verify-gate";
import { ArrowRight, Receipt } from "lucide-react";

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
  const session = useVerifiedSession();
  const listFn = useServerFn(listMyOrders);
  const { data, isLoading } = useQuery({ queryKey: ["my-orders"], queryFn: () => listFn() });

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.3em] text-cherry">Vol. 01 · Your history</p>
        <h1 className="mt-2 font-display text-5xl">
          {session ? <>Every bite,<br /><span className="italic text-cherry">@{session.username}</span></> : "Your orders"}
        </h1>

        {isLoading ? (
          <p className="mt-10 text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
            <Receipt className="mx-auto h-10 w-10 text-cherry" />
            <p className="mt-4 font-display text-2xl">No orders yet.</p>
            <p className="mt-1 text-muted-foreground">Head to the menu and grab a bite.</p>
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
                <Link
                  to="/order/$id"
                  params={{ id: o.id }}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-white p-5 shadow-sm transition hover:border-cherry/40 hover:shadow-md"
                >
                  <div>
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
                    <span className="font-display text-2xl tabular-nums">B${o.total_bs.toLocaleString()}</span>
                    <ArrowRight className="h-5 w-5 text-ink/40 transition group-hover:translate-x-1 group-hover:text-cherry" />
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}