import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import {
  listMyPriorityLevels,
  upsertPriorityLevel,
} from "@/lib/members.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Zap } from "lucide-react";

export const Route = createFileRoute("/staff/priority")({
  head: () => ({
    meta: [
      { title: "Priority — Panda Bites Staff" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PriorityPage,
});

/** Canonical defaults — these are what appear at checkout once saved. */
const TIERS = [
  {
    tier: "low" as const,
    name: "Low Priority",
    price_bs: 1000,
    color: "#7bbf6a",
  },
  {
    tier: "mid" as const,
    name: "Mid Priority",
    price_bs: 5000,
    color: "#e2a03f",
  },
  {
    tier: "high" as const,
    name: "High Priority",
    price_bs: 15000,
    color: "#d94f5c",
  },
];

type Row = {
  tier: "low" | "mid" | "high";
  name: string;
  price_bs: number;
  color: string;
  is_active: boolean;
  /** False until this tier exists in chef_priority_levels */
  saved: boolean;
};

function PriorityPage() {
  const listFn = useServerFn(listMyPriorityLevels);
  const saveFn = useServerFn(upsertPriorityLevel);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-priority-levels"],
    queryFn: () => listFn(),
  });

  const [rows, setRows] = useState<Row[]>(
    TIERS.map((t) => ({ ...t, is_active: true, saved: false })),
  );

  // Track whether we have already auto-seeded missing tiers this session
  // so we don't fire the mutation more than once.
  const didAutoSeed = useRef(false);

  useEffect(() => {
    if (!data) return;
    setRows(
      TIERS.map((t) => {
        const found = data.find((d) => d.tier === t.tier);
        return found
          ? {
              tier: t.tier,
              name: found.name,
              price_bs: found.price_bs,
              color: found.color,
              is_active: found.is_active,
              saved: true,
            }
          : { ...t, is_active: true, saved: false };
      }),
    );
  }, [data]);

  const mut = useMutation({
    mutationFn: async (row: Row) => {
      await saveFn({
        data: {
          tier: row.tier,
          name: row.name,
          price_bs: row.price_bs,
          color: row.color,
          is_active: row.is_active,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-priority-levels"] });
      // Also bust public checkout cache
      qc.invalidateQueries({ queryKey: ["priority-levels"] });
      toast.success("Priority level saved — it will show at checkout");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const saveAll = useMutation({
    mutationFn: async (rowsToSave: Row[]) => {
      for (const row of rowsToSave) {
        await saveFn({
          data: {
            tier: row.tier,
            name: row.name,
            price_bs: row.price_bs,
            color: row.color,
            is_active: row.is_active,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-priority-levels"] });
      qc.invalidateQueries({ queryKey: ["priority-levels"] });
      toast.success(
        "All three priority tiers saved — checkout will show Low, Mid, and High",
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save all"),
  });

  // Auto-seed any missing tiers the first time this chef opens the page.
  // This is the main fix for "only High shows" — Low/Mid were never persisted.
  useEffect(() => {
    if (!data || isLoading || didAutoSeed.current) return;

    const missing = TIERS.filter(
      (t) => !data.some((d) => d.tier === t.tier),
    );
    if (missing.length === 0) {
      didAutoSeed.current = true;
      return;
    }

    didAutoSeed.current = true;

    (async () => {
      try {
        for (const t of missing) {
          await saveFn({
            data: {
              tier: t.tier,
              name: t.name,
              price_bs: t.price_bs,
              color: t.color,
              is_active: true,
            },
          });
        }
        qc.invalidateQueries({ queryKey: ["my-priority-levels"] });
        qc.invalidateQueries({ queryKey: ["priority-levels"] });
        toast.success(
          `Auto-created ${missing.map((m) => m.tier).join(", ")} priority — all three tiers are now live at checkout`,
        );
      } catch (e) {
        // Allow the chef to still use the manual Save buttons
        didAutoSeed.current = false;
        toast.error(
          e instanceof Error
            ? e.message
            : "Could not auto-create missing priority tiers",
        );
      }
    })();
  }, [data, isLoading, saveFn, qc]);

  function patch(tier: Row["tier"], next: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.tier === tier ? { ...r, ...next } : r)),
    );
  }

  const unsaved = rows.filter((r) => !r.saved).length;
  const inactiveSaved = rows.filter((r) => r.saved && !r.is_active).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">
            Kitchen
          </p>
          <h1 className="mt-1 font-display text-4xl">Priority levels</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Members can buy priority with B$ at checkout. Missing tiers are
            created automatically the first time you open this page. You can
            still edit prices, names and colours, then hit{" "}
            <strong>Save</strong> (or Save all).
          </p>
        </div>
        <Button
          onClick={() => saveAll.mutate(rows)}
          disabled={saveAll.isPending || mut.isPending}
          className="rounded-full bg-cherry text-cream hover:bg-ink"
        >
          {saveAll.isPending ? "Saving…" : "Save all three tiers"}
        </Button>
      </div>

      {(unsaved > 0 || inactiveSaved > 0) && (
        <div className="mb-4 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {unsaved > 0 && (
            <p>
              <strong>{unsaved} tier(s) not saved yet</strong> — they will{" "}
              <strong>not</strong> appear at checkout until they are written to
              the database (auto-seed runs on first visit, or use Save / Save
              all).
            </p>
          )}
          {inactiveSaved > 0 && (
            <p className={unsaved > 0 ? "mt-1" : undefined}>
              <strong>{inactiveSaved} saved tier(s) are switched off</strong> —
              checkout only shows active tiers.
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Loading your priority levels…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {rows.map((row, i) => (
            <motion.div
              key={row.tier}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-3xl border border-border bg-white p-5"
              style={{ borderColor: `${row.color}55` }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white"
                  style={{ backgroundColor: row.color }}
                >
                  <Zap className="h-3 w-3" />
                  {row.tier}
                </span>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={`active-${row.tier}`}
                    className="text-xs text-ink/60"
                  >
                    Active
                  </Label>
                  <Switch
                    id={`active-${row.tier}`}
                    checked={row.is_active}
                    onCheckedChange={(checked) =>
                      patch(row.tier, { is_active: checked })
                    }
                  />
                </div>
              </div>

              <p className="mt-3 text-xs">
                {row.saved ? (
                  row.is_active ? (
                    <span className="text-emerald-700">Live on checkout</span>
                  ) : (
                    <span className="text-amber-700">
                      Saved but off — hidden at checkout
                    </span>
                  )
                ) : (
                  <span className="text-rose-700">
                    Not saved — missing from cart
                  </span>
                )}
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <Label htmlFor={`name-${row.tier}`}>Name</Label>
                  <Input
                    id={`name-${row.tier}`}
                    value={row.name}
                    maxLength={40}
                    onChange={(e) =>
                      patch(row.tier, { name: e.target.value })
                    }
                    className="mt-1.5 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor={`price-${row.tier}`}>Price (B$)</Label>
                  <Input
                    id={`price-${row.tier}`}
                    type="number"
                    min={0}
                    value={row.price_bs}
                    onChange={(e) =>
                      patch(row.tier, {
                        price_bs: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="mt-1.5 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <Label htmlFor={`color-${row.tier}`}>Colour</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      id={`color-${row.tier}`}
                      type="color"
                      value={row.color}
                      onChange={(e) =>
                        patch(row.tier, { color: e.target.value })
                      }
                      className="h-10 w-14 cursor-pointer rounded-xl border border-border bg-white"
                    />
                    <span className="text-xs uppercase tracking-widest text-ink/50">
                      {row.color}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => mut.mutate(row)}
                disabled={mut.isPending || saveAll.isPending}
                className="mt-5 w-full rounded-full bg-ink text-cream hover:bg-cherry"
              >
                Save {row.tier}
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
