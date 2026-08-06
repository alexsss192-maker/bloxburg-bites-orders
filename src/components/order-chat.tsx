import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Send, MessageCircle } from "lucide-react";

import {
  getOrderMessages,
  listChefMessages,
  postChefMessage,
  postCustomerMessage,
  type OrderMessage,
} from "@/lib/order-chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function OrderChat({
  orderId,
  authorName,
  mode,
  className = "",
}: {
  orderId: string;
  authorName: string;
  mode: "customer" | "chef";
  className?: string;
}) {
  const readFn = useServerFn(mode === "customer" ? getOrderMessages : listChefMessages);
  const writeFn = useServerFn(mode === "customer" ? postCustomerMessage : postChefMessage);
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);

  const queryKey = useMemo(() => ["order-chat", mode, orderId], [mode, orderId]);
  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => readFn({ data: { order_id: orderId } }) as Promise<OrderMessage[]>,
    refetchInterval: 5000,
  });

  const send = useMutation({
    mutationFn: async (text: string) =>
      writeFn({ data: { order_id: orderId, author_name: authorName, body: text } }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Message could not be sent"),
  });

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const mine = mode === "customer" ? "customer" : "chef";

  return (
    <div className={`pb-section flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-petal text-cherry">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-lg leading-none">Order chat</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "customer" ? "Talk to your chef here — no Discord DMs needed." : "Talking with the customer."}
          </p>
        </div>
      </div>

      <div ref={scroller} className="max-h-[22rem] min-h-[12rem] flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading messages…</p>}
        {!isLoading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet. Say hi 👋</p>
        )}
        {messages.map((m) => {
          if (m.sender_kind === "system") {
            return (
              <p key={m.id} className="mx-auto max-w-[85%] rounded-xl bg-petal/70 px-3 py-2 text-center text-xs text-muted-foreground">
                {m.body}
              </p>
            );
          }
          const isMine = m.sender_kind === mine;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[80%] px-4 py-2.5 ${isMine ? "pb-bubble-me" : "pb-bubble-them"}`}>
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] opacity-70">
                  {m.sender_kind === "chef" ? `Chef ${m.author_name}` : m.author_name}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                <p className="mt-1 text-[0.6rem] opacity-60">{timeLabel(m.created_at)}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = body.trim();
          if (!text) return;
          send.mutate(text);
        }}
        className="flex items-end gap-2 border-t border-border/70 px-4 py-3"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const text = body.trim();
              if (text) send.mutate(text);
            }
          }}
          maxLength={1000}
          rows={2}
          placeholder="Ask about pickup time, payment, or delivery…"
          className="min-h-11 flex-1 resize-none rounded-2xl border-border bg-background"
        />
        <Button
          type="submit"
          disabled={send.isPending || body.trim().length === 0}
          className="pb-press h-11 w-11 rounded-2xl bg-accent p-0 text-accent-foreground hover:bg-sakura"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}