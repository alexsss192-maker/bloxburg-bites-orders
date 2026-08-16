import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

import { listStockAlerts, dismissStockAlert } from "@/lib/menu.functions";

/**
 * Low-stock alert banner for staff pages.
 * Loads once on mount / when staff menu or orders invalidate the query.
 * Does NOT poll — stock only changes when someone orders or a chef edits stock.
 */
export function StockAlertsPanel({ className = "" }: { className?: string }) {
  const listFn = useServerFn(listStockAlerts);
  const dismissFn = useServerFn(dismissStockAlert);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: () => listFn(),
    // No interval — staff.orders + staff.menu already invalidate this key
    // after place/fulfill/stock edits. Cuts idle Supabase traffic.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-alerts"] }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not dismiss"),
  });

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;
  const ownerNames = data?.owner_names ?? {};

  return (
    <section
      className={`rounded-3xl border border-cherry/30 bg-petal p-5 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-cherry">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-xl leading-none">
            {alerts.length} low-stock alert
            {alerts.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-ink/60">
            Restock these before customers hit a sold-out card.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {alerts.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3"
          >
            <span className="flex-1 font-semibold">
              {a.item_name}
              {data?.is_admin &&
                a.owner_id &&
                a.owner_id !== data.my_user_id && (
                  <span className="ml-2 text-xs font-normal text-ink/50">
                    {ownerNames[a.owner_id] ?? "another chef"}
                  </span>
                )}
            </span>
            <span className="rounded-full bg-cherry/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-cherry">
              {a.stock} left · alert at {a.threshold}
            </span>
            <button
              onClick={() => dismiss.mutate(a.id)}
              className="rounded-full p-2 text-ink/50 transition hover:bg-ink/5 hover:text-ink"
              aria-label={`Dismiss alert for ${a.item_name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
