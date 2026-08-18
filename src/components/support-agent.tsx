import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Shield, Mail, Trash2, HelpCircle } from "lucide-react";

export type SupportIntent = "question" | "export" | "delete";

type ChatLine = {
  id: string;
  role: "agent" | "user" | "system";
  text: string;
};

const INTENTS: Array<{
  id: SupportIntent;
  label: string;
  blurb: string;
  icon: typeof HelpCircle;
}> = [
  {
    id: "question",
    label: "Ask a question",
    blurb: "Terms, privacy, orders, or kitchen how-tos",
    icon: HelpCircle,
  },
  {
    id: "export",
    label: "Email my data",
    blurb: "Request a copy of profile / order info",
    icon: Mail,
  },
  {
    id: "delete",
    label: "Delete my data",
    blurb: "Ask staff to remove what we can",
    icon: Trash2,
  },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function SupportAgentFab({ page }: { page: "terms" | "privacy" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-cream shadow-xl shadow-ink/25 hover:bg-ink/90"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        aria-label="Open support agent"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-cherry text-base">
          🐼
        </span>
        <span className="hidden sm:inline">Bamboo Desk</span>
        <MessageCircle className="h-4 w-4 opacity-70" />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <SupportAgentModal page={page} onClose={() => setOpen(false)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function SupportAgentModal({
  page,
  onClose,
}: {
  page: "terms" | "privacy";
  onClose: () => void;
}) {
  const [intent, setIntent] = useState<SupportIntent | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([
    {
      id: "hi",
      role: "agent",
      text: "Hi friend — I'm the Bamboo Desk helper 🐼 Soft ears, no judgment. What do you need today?",
    },
  ]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, intent, sent]);

  function pickIntent(next: SupportIntent) {
    setIntent(next);
    setSent(false);
    const labels = {
      question: "Got it — ask me anything about the kitchen rules or your data.",
      export:
        "Okay! Tell us where to send a copy of what we can find (profile / orders). Staff will follow up in Discord or email.",
      delete:
        "Understood. Deletion requests are handled by humans on staff. Share enough detail so we can find the right records.",
    };
    setLines((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        text: INTENTS.find((i) => i.id === next)!.label,
      },
      { id: uid(), role: "agent", text: labels[next] },
    ]);
  }

  function buildPacket() {
    return [
      `Panda Bites · Bamboo Desk request`,
      `Page: ${page}`,
      `Type: ${intent}`,
      `Name: ${name || "—"}`,
      `Email: ${email || "—"}`,
      `Member handle / username: ${handle || "—"}`,
      `Message:`,
      message || "—",
      `Submitted: ${new Date().toISOString()}`,
    ].join("\n");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!intent) return;
    const packet = buildPacket();
    setLines((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        text: message || `(${intent} request submitted)`,
      },
      {
        id: uid(),
        role: "agent",
        text:
          intent === "delete"
            ? "Request noted. Copy the ticket below and paste it to Panda Bites staff in Discord — or use Email staff. A human will confirm what can be removed."
            : intent === "export"
              ? "Request noted. Staff will try to send what we hold to the email you listed (or reply in Discord if email bounces)."
              : "Thanks! Staff can dig in if you paste this ticket in Discord — or email it over.",
      },
    ]);
    setSent(true);
    try {
      void navigator.clipboard.writeText(packet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard optional */
    }
  }

  const mailto = `mailto:support@pandabites.local?subject=${encodeURIComponent(
    `[Bamboo Desk] ${intent ?? "support"}`,
  )}&body=${encodeURIComponent(buildPacket())}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-label="Close support"
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Bamboo Desk support"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative flex h-[min(36rem,88vh)] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-ink/10 bg-cream shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-ink/10 bg-gradient-to-r from-blossom/80 via-cream to-petal/40 px-4 py-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl shadow-sm">
            🐼
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-none text-ink">
              Bamboo Desk
            </p>
            <p className="mt-1 flex items-center gap-1 text-[0.7rem] text-ink/55">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Soft support · not a real-time bot brain
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {lines.map((line) => (
            <div
              key={line.id}
              className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  line.role === "user"
                    ? "bg-ink text-cream"
                    : "bg-white text-ink shadow-sm ring-1 ring-ink/5"
                }`}
              >
                {line.text}
              </div>
            </div>
          ))}

          {!intent ? (
            <div className="grid gap-2 pt-1">
              {INTENTS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickIntent(item.id)}
                    className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white/90 p-3 text-left transition hover:border-cherry/30 hover:bg-white"
                  >
                    <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-blossom/60 text-ink">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/55">
                        {item.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {intent && !sent ? (
          <form
            onSubmit={onSubmit}
            className="space-y-2 border-t border-ink/10 bg-white/70 p-3 backdrop-blur-sm"
          >
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-ink/60">
                <Shield className="h-3 w-3" />
                {intent}
              </span>
              <button
                type="button"
                className="text-[0.65rem] text-cherry underline"
                onClick={() => {
                  setIntent(null);
                  setMessage("");
                }}
              >
                Change
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="rounded-xl border border-ink/10 bg-cream px-3 py-2 text-sm outline-none focus:border-cherry/40"
              />
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="Username / handle"
                className="rounded-xl border border-ink/10 bg-cream px-3 py-2 text-sm outline-none focus:border-cherry/40"
              />
            </div>
            <input
              type="email"
              required={intent === "export"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                intent === "export" ? "Email for your data copy *" : "Email (optional)"
              }
              className="w-full rounded-xl border border-ink/10 bg-cream px-3 py-2 text-sm outline-none focus:border-cherry/40"
            />
            <div className="flex gap-2">
              <textarea
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  intent === "delete"
                    ? "What should we try to delete?"
                    : intent === "export"
                      ? "What should we include in the export?"
                      : "Your question…"
                }
                rows={2}
                className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-ink/10 bg-cream px-3 py-2 text-sm outline-none focus:border-cherry/40"
              />
              <button
                type="submit"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cherry text-cream hover:bg-cherry/90"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        ) : null}

        {sent ? (
          <div className="space-y-2 border-t border-ink/10 bg-white/80 p-3 text-xs text-ink/70">
            <p>
              Ticket ready {copied ? "· copied to clipboard ✓" : "· copy failed, use email"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-ink px-3 py-1.5 text-cream"
                onClick={() => {
                  void navigator.clipboard.writeText(buildPacket());
                  setCopied(true);
                }}
              >
                Copy ticket
              </button>
              <a
                href={mailto}
                className="rounded-full border border-ink/15 bg-cream px-3 py-1.5 text-ink"
              >
                Email staff
              </a>
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-cherry underline"
                onClick={() => {
                  setSent(false);
                  setIntent(null);
                  setMessage("");
                }}
              >
                New request
              </button>
            </div>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
