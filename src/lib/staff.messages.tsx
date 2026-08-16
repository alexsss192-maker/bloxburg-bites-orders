import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircleOff } from "lucide-react";

export const Route = createFileRoute("/staff/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Panda Bites Staff" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesRemovedPage,
});

/** Order chat removed — no order_messages reads/writes. */
function MessagesRemovedPage() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-petal text-cherry">
        <MessageCircleOff className="h-6 w-6" />
      </span>
      <h1 className="mt-6 font-display text-4xl">Order chat removed</h1>
      <p className="mt-3 text-sm text-ink/60">
        In-app order messages are off to cut database load. Arrange payment and delivery with
        customers on Discord using the username on each order.
      </p>
      <Link
        to="/staff/orders"
        className="mt-8 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
      >
        Back to orders
      </Link>
    </div>
  );
}
