import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "framer-motion";
import { listPandaAudit } from "@/lib/panda.functions";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Filter, Sparkles } from "lucide-react";

export const Route = createFileRoute("/staff/audit")({
  head: () => ({
    meta: [{ title: "Panda audit log — Panda Bites Staff" }, { name: "robots", content: "noindex" }],
  }),
  component: AuditPage,
});

const ACTION_LABELS: Record<string, { label: string; tone: string }> = {
  add_item: { label: "Item added", tone: "bg-bamboo/15 text-bamboo-foreground border-bamboo/30" },
  update_stock: { label: "Stock updated", tone: "bg-cherry/10 text-cherry border-cherry/30" },
  add_item_failed: { label: "Add failed", tone: "bg-destructive/10 text-destructive border-destructive/30" },
  update_stock_failed: { label: "Update failed", tone: "bg-destructive/10 text-destructive border-destructive/30" },
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

function AuditPage() {
  const listFn = useServerFn(listPandaAudit);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actor, setActor] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["panda-audit", actionFilter, actor],
    queryFn: () =>
      listFn({
        data: {
          limit: 100,
          action: actionFilter || null,
          actor: actor.trim() || null,
        },
      }),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cherry">
            <Sparkles className="h-3.5 w-3.5" /> Panda · Audit trail
          </p>
          <h1 className="mt-1 font-display text-3xl">Every Panda action, logged.</h1>
          <p className="mt-1 text-sm text-ink/60">
            Nothing here can be edited — this is the source of truth for stock and menu changes.
          </p>
        </div>
        <Link
          to="/staff/panda"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-blossom"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Panda
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-border/60 bg-white p-4 shadow-sm">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs uppercase tracking-widest text-ink/50">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-ink/10 bg-blossom/60 px-3 text-sm"
          >
            <option value="">All actions</option>
            <option value="add_item">Items added</option>
            <option value="update_stock">Stock updated</option>
            <option value="add_item_failed">Add failed</option>
            <option value="update_stock_failed">Update failed</option>
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="text-xs uppercase tracking-widest text-ink/50">Actor email</label>
          <Input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="filter by email"
            className="mt-1 h-10 rounded-xl border-ink/10 bg-blossom/60"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-medium text-cream hover:bg-cherry"
        >
          <Filter className="h-3.5 w-3.5" />
          {isFetching ? "Refreshing…" : "Apply"}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-blossom/50" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
          <div className="text-5xl">🐼</div>
          <p className="mt-3 font-display text-2xl">No audit entries yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When Panda adds an item or updates stock, it will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((e, i) => {
            const meta = ACTION_LABELS[e.action] ?? { label: e.action, tone: "bg-ink/5 border-ink/10 text-ink" };
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(e.payload_json) as Record<string, unknown>;
            } catch {
              payload = {};
            }
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-white p-4 text-sm shadow-sm"
              >
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.tone}`}
                >
                  {meta.label}
                </span>
                <span className="font-medium text-ink">
                  {typeof payload.name === "string" ? payload.name : e.target_id ?? "(unknown)"}
                </span>
                <span className="text-ink/60">
                  {typeof payload.new_stock === "number"
                    ? `stock ${payload.previous_stock ?? "?"} → ${payload.new_stock}`
                    : typeof payload.stock === "number"
                      ? `stock ${payload.stock}`
                      : typeof payload.error === "string"
                        ? payload.error
                        : ""}
                </span>
                <span className="ml-auto flex items-center gap-3 text-xs text-ink/50">
                  <span className="rounded-full bg-blossom/70 px-2 py-0.5">
                    {e.actor_email ?? e.actor_user_id?.slice(0, 8) ?? "system"}
                  </span>
                  <span title={new Date(e.created_at).toLocaleString()}>{formatWhen(e.created_at)}</span>
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}