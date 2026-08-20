import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  type TipOption,
  loadTipOptions,
  saveTipOptions,
  formatTipOption,
} from "@/lib/tips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/staff/tips")({
  head: () => ({
    meta: [
      { title: "Tip jar — Panda Bites Staff" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TipsPage,
});

function TipsPage() {
  const [slots, setSlots] = useState<TipOption[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSlots(loadTipOptions());
    setReady(true);
  }, []);

  function patch(order: 1 | 2 | 3, next: Partial<TipOption>) {
    setSlots((prev) =>
      prev.map((s) => (s.sort_order === order ? { ...s, ...next } : s)),
    );
  }

  function save() {
    const saved = saveTipOptions(slots);
    setSlots(saved);
    toast.success("Tip jar saved — checkout on this site will use these presets");
  }

  function resetDefaults() {
    const defaults = saveTipOptions([
      {
        id: "tip-1",
        sort_order: 1,
        label: "Kind",
        tip_type: "percentage",
        tip_value: 10,
        is_active: true,
      },
      {
        id: "tip-2",
        sort_order: 2,
        label: "Generous",
        tip_type: "percentage",
        tip_value: 15,
        is_active: true,
      },
      {
        id: "tip-3",
        sort_order: 3,
        label: "Legend",
        tip_type: "fixed",
        tip_value: 5000,
        is_active: true,
      },
    ]);
    setSlots(defaults);
    toast.message("Restored default tip presets");
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading tip jar…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">Kitchen</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-4xl">
            <Heart className="h-8 w-8 text-cherry" />
            Tip jar
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Up to <strong>3 tip presets</strong> at checkout —{" "}
            <strong>%</strong> of the food total or a <strong>fixed B$</strong> amount.
            No database: settings are stored in this browser. Chosen tips are
            written into the order note so the kitchen sees them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetDefaults} className="rounded-full">
            Reset defaults
          </Button>
          <Button
            onClick={save}
            className="rounded-full bg-cherry text-cream hover:bg-ink"
          >
            Save tip jar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {slots.map((s) => (
          <article
            key={s.sort_order}
            className="rounded-3xl border border-border bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.25em] text-cherry">
                Slot {s.sort_order}
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor={`active-${s.sort_order}`} className="text-xs text-ink/60">
                  Active
                </Label>
                <Switch
                  id={`active-${s.sort_order}`}
                  checked={s.is_active}
                  onCheckedChange={(v) => patch(s.sort_order, { is_active: v })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor={`label-${s.sort_order}`}>Label</Label>
                <Input
                  id={`label-${s.sort_order}`}
                  value={s.label}
                  onChange={(e) => patch(s.sort_order, { label: e.target.value })}
                  maxLength={40}
                  placeholder="e.g. Kind"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Type</Label>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant={s.tip_type === "percentage" ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      patch(s.sort_order, {
                        tip_type: "percentage",
                        tip_value: Math.min(s.tip_value, 100),
                      })
                    }
                  >
                    Percent %
                  </Button>
                  <Button
                    type="button"
                    variant={s.tip_type === "fixed" ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => patch(s.sort_order, { tip_type: "fixed" })}
                  >
                    Fixed B$
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor={`value-${s.sort_order}`}>
                  {s.tip_type === "percentage" ? "Percent (0–100)" : "Amount (B$)"}
                </Label>
                <Input
                  id={`value-${s.sort_order}`}
                  type="number"
                  min={0}
                  max={s.tip_type === "percentage" ? 100 : 100000000}
                  value={s.tip_value}
                  onChange={(e) =>
                    patch(s.sort_order, {
                      tip_value: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    })
                  }
                  className="mt-1"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Checkout shows:{" "}
                <span className="font-medium text-ink">{formatTipOption(s)}</span>
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
