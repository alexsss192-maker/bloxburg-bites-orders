import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { getOrder } from "@/lib/menu.functions";
import { SiteHeader } from "@/components/site-header";

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

function OrderPage() {
  const { id } = Route.useParams();
  const { data: order } = useSuspenseQuery({
    queryKey: ["order", id],
    queryFn: () => getOrder({ data: { id } }),
  });

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-border/60 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3 text-bamboo">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-sm uppercase tracking-[0.3em]">Order confirmed</p>
          </div>
          <h1 className="font-display text-4xl">Thanks, {order.discord_username}!</h1>
          <p className="mt-2 text-muted-foreground">
            Reference <span className="font-mono text-ink">#{order.id.slice(0, 8)}</span> · status{" "}
            <span className="font-semibold text-ink">{order.status}</span>
          </p>
          <ul className="mt-6 divide-y divide-border/60">
            {order.items.map((i, idx) => (
              <li key={idx} className="flex items-center justify-between py-3">
                <span>
                  <span className="font-medium">{i.item_name}</span>{" "}
                  <span className="text-muted-foreground">× {i.quantity}</span>
                </span>
                <span className="tabular-nums">B${(i.unit_price_bs * i.quantity).toLocaleString()}</span>
              </li>
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
          <div className="mt-8 rounded-2xl bg-cherry/10 p-4 text-sm text-ink/80">
            Head to the <b>Panda Bites</b> Discord — a chef will DM you shortly to arrange your B$ payment and
            in-game delivery.
          </div>
          <Link to="/menu" className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream hover:bg-cherry">
            Back to menu
          </Link>
        </div>
      </main>
    </div>
  );
}