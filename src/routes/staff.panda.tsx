import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  reportSkippeIssue,
  detectSkippeProblem,
  reportLovableError,
  diagnoseSkippeFailure,
} from "@/lib/lovable-error-reporting";
import {
  parseErrorStack,
  formatErrorForCopy,
  type ParsedStackFrame,
} from "@/lib/parse-error-stack";
import { pandaChat } from "@/lib/panda.functions";
import { SKIPPE_MODE_OPTIONS, modelShowsThinking, MODEL_BY_MODE, type SkippeMode } from "@/lib/skippe-models";
import { GoogleGlyph } from "@/components/google-glyph";
import { ChatGptGlyph } from "@/components/chatgpt-glyph";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, ChevronDown, ImagePlus, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/staff/panda")({
  head: () => ({
    meta: [
      { title: "Skippe AI — Panda Bites Staff" },
      { name: "description", content: "Run your Panda Bites menu, discounts, orders and customer chats with Skippe." },
      { property: "og:title", content: "Skippe AI — Panda Bites Staff" },
      { property: "og:description", content: "AI assistant for Panda Bites chefs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PandaPage,
});

type ToolRun = { name: string; ok: boolean; summary: string; detail?: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  thinking?: string;
  runs?: ToolRun[];
};

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi chef — I’m Skippe. Ask me to add or edit your menu items, run a discount, move an order to preparing/ready/delivered, or reply to a customer. Snap photos too (up to 9) and I’ll read them.",
};

function ModeGlyph({ vendor }: { vendor: "openai" | "google" }) {
  return vendor === "openai" ? <ChatGptGlyph /> : <GoogleGlyph />;
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-ink/10 bg-white/70">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink/70 hover:text-ink"
      >
        <Brain className="h-3.5 w-3.5 text-cherry" />
        {open ? "Hide thinking" : "Show thinking"}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t border-ink/10 px-3 py-2 text-xs leading-relaxed text-ink/60">
          {text}
        </p>
      )}
    </div>
  );
}


/** Same shape as the root ErrorComponent — plus Why / Where / Lines / Fix. */
function SkippeIssueCard({
  error,
  context,
  onDismiss,
}: {
  error: Error;
  context?: Record<string, unknown>;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const frames: ParsedStackFrame[] = parseErrorStack(error);
  const diagnosis = diagnoseSkippeFailure(error.message || "");

  useEffect(() => {
    reportLovableError(error, {
      source: "skippe",
      boundary: "staff_panda_issue_card",
      diagnosis,
      ...context,
    });
  }, [error, context, diagnosis]);

  const copyText = [
    formatErrorForCopy(error, frames),
    "",
    `Title: ${diagnosis.title}`,
    `Why: ${diagnosis.why}`,
    `Where: ${diagnosis.where}`,
    `Lines: ${diagnosis.lines}`,
    `Fix: ${diagnosis.fix}`,
    context ? `\nContext:\n${JSON.stringify(context, null, 2)}` : "",
  ].join("\n");

  function handleCopy() {
    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  }

  return (
    <div className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/5">
      <div className="border-b border-destructive/30 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
          Skippe hit a problem
        </p>
        <h2 className="mt-1 text-base font-semibold text-foreground">
          {diagnosis.title}
        </h2>
        <p className="mt-2 break-words font-mono text-xs text-foreground/80">
          {error.name}: {error.message}
        </p>
      </div>

      <div className="space-y-3 border-b border-destructive/30 px-5 py-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why</p>
          <p className="mt-1 text-foreground">{diagnosis.why}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</p>
          <p className="mt-1 font-mono text-xs text-foreground">{diagnosis.where}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lines / symbols</p>
          <p className="mt-1 font-mono text-xs text-foreground">{diagnosis.lines}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How to fix</p>
          <p className="mt-1 text-foreground">{diagnosis.fix}</p>
        </div>
      </div>

      {frames.length > 0 && (
        <div className="border-b border-destructive/30 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Client stack (staff.panda send)
          </p>
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 text-foreground">
            {frames
              .map((f) =>
                f.file
                  ? `at ${f.functionName ?? "(anonymous)"} — ${f.file}:${f.line}:${f.column}`
                  : f.raw,
              )
              .join("\n")}
          </pre>
        </div>
      )}

      {context && Object.keys(context).length > 0 && (
        <div className="border-b border-destructive/30 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Context
          </p>
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 text-foreground">
            {JSON.stringify(context, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          {copied ? "Copied!" : "Copy error details"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}


const SKIPPE_CHAT_KEY = "pb_skippe_chat_v1";

function loadSkippeChat(): Msg[] {
  try {
    const raw = window.localStorage.getItem(SKIPPE_CHAT_KEY);
    if (!raw) return [GREETING];
    const parsed = JSON.parse(raw) as Msg[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [GREETING];
    return parsed.slice(-40);
  } catch {
    return [GREETING];
  }
}

function saveSkippeChat(msgs: Msg[]) {
  try {
    const slim = msgs.slice(-40).map((m) => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking,
      runs: m.runs,
    }));
    window.localStorage.setItem(SKIPPE_CHAT_KEY, JSON.stringify(slim));
  } catch {
    /* quota / private mode */
  }
}

function PandaPage() {
  const chatFn = useServerFn(pandaChat);
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<{
    error: Error;
    context?: Record<string, unknown>;
  } | null>(null);
  const [mode, setMode] = useState<SkippeMode>("gpt5_nano");
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Hydrate chat + mode from localStorage (no server history).
  useEffect(() => {
    setMessages(loadSkippeChat());
    try {
      const stored = window.localStorage.getItem("pb_skippe_mode") as SkippeMode | null;
      if (stored && SKIPPE_MODE_OPTIONS.some((o) => o.value === stored)) setMode(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Persist chat locally whenever it changes.
  useEffect(() => {
    if (messages.length === 0) return;
    saveSkippeChat(messages);
  }, [messages]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  function pickMode(next: SkippeMode) {
    setMode(next);
    try {
      window.localStorage.setItem("pb_skippe_mode", next);
    } catch {
      /* storage unavailable */
    }
  }

  async function clearChat() {
    setMessages([GREETING]);
    saveSkippeChat([GREETING]);
    toast.success("Conversation cleared");
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 9 - images.length;
    const arr = Array.from(files).slice(0, remaining);
    const results = await Promise.all(
      arr.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(f);
          }),
      ),
    );
    setImages((prev) => [...prev, ...results].slice(0, 9));
  }

  async function send() {
    if (!input.trim() && images.length === 0) return;
    const userMsg: Msg = { role: "user", content: input.trim() || "(scan these images)", images: [...images] };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));
    const payload = {
      message: input.trim(),
      images: images.map((d) => ({ data_url: d })),
      mode,
      history,
    };
    setInput("");
    setImages([]);
    try {
      const res = await chatFn({ data: payload });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.auto ? `${res.reply}\n\n_Answered by ${res.model_label}._` : res.reply,
          thinking: res.thinking || undefined,
          runs: res.runs?.length ? res.runs : undefined,
        },
      ]);
      
      qc.invalidateQueries({ queryKey: ["staff-menu"] });
      qc.invalidateQueries({ queryKey: ["staff-orders"] });
      qc.invalidateQueries({ queryKey: ["staff-discounts"] });
      if (res.runs?.length) {
        setRuns((a) => [...res.runs, ...a].slice(0, 40));
        const okCount = res.runs.filter((x) => x.ok).length;
        if (okCount > 0) toast.success(`Skippe made ${okCount} change${okCount === 1 ? "" : "s"}`);
      }

      // Soft health — same reporting path as the crash popup (parse-error-stack + reportLovableError).
      setIssue(null);
      const problem = detectSkippeProblem({
        reply: res.reply ?? "",
        runs: res.runs ?? [],
        model: res.model,
        userMessage: payload.message,
      });
      if (problem) {
        const softErr = new Error(problem);
        softErr.name = "SkippeIssue";
        const ctx = {
          model: res.model,
          model_label: res.model_label,
          userMessage: payload.message,
          runs: res.runs ?? [],
          replyPreview: (res.reply ?? "").slice(0, 300),
        };
        reportSkippeIssue(problem, ctx, "warning");
        setIssue({ error: softErr, context: ctx });
      }
    } catch (err) {
      const hard = err instanceof Error ? err : new Error(String(err));
      const ctx = {
        source: "skippe",
        boundary: "staff_panda_send",
        userMessage: payload.message,
        mode: payload.mode,
      };
      reportLovableError(hard, ctx);
      reportSkippeIssue(hard.message, ctx, "error");
      setIssue({ error: hard, context: ctx });
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I hit an error. Try again?" }]);
    } finally {
      setLoading(false);
    }
  }

  const activeModel = mode === "auto" ? "" : MODEL_BY_MODE[mode];
  const thinkingCapable = activeModel ? modelShowsThinking(activeModel) : false;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-3xl border border-border/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-blossom to-petal px-6 py-4">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cherry">
              <Sparkles className="h-3.5 w-3.5" /> Skippe · AI kitchen assistant
            </p>
            <h1 className="mt-1 font-display text-2xl">Ask me to run your kitchen.</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={mode} onValueChange={(v) => pickMode(v as SkippeMode)}>
              <SelectTrigger className="h-11 w-[16.5rem] rounded-2xl border-ink/10 bg-white text-left text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {SKIPPE_MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-xl py-2.5">
                    <span className="flex w-full items-center gap-2">
                      <ModeGlyph vendor={o.vendor} />
                      <span className="font-semibold">{o.label}</span>
                      <span className="ml-auto pl-4 text-xs text-ink/50">Cost: {o.cost}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={clearChat}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-ink/10 bg-white text-ink/60 transition hover:text-destructive"
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {issue && (
          <SkippeIssueCard
            error={issue.error}
            context={issue.context}
            onDismiss={() => setIssue(null)}
          />
        )}

        <div ref={scroller} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm ${
                    m.role === "user" ? "bg-ink text-cream" : "bg-blossom text-ink"
                  }`}
                >
                  {m.images && m.images.length > 0 && (
                    <div className="mb-2 grid grid-cols-3 gap-1">
                      {m.images.map((img, idx) => (
                        <img key={idx} src={img} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                  {m.thinking && <ThinkingBlock text={m.thinking} />}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.runs && m.runs.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-ink/10 pt-2 text-xs">
                      {m.runs.map((r, idx) => (
                        <li key={idx} className={r.ok ? "text-bamboo" : "text-destructive"}>
                          {r.ok ? "✅" : "⚠️"} {r.summary}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-ink/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Skippe is thinking…
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border/60 bg-cream/50 p-4">
          {images.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <AnimatePresence>
                {images.map((img, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="relative"
                  >
                    <img src={img} alt="" className="h-16 w-16 rounded-xl object-cover ring-2 ring-cherry/30" />
                    <button
                      onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-cream"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <span className="ml-1 self-end text-xs text-ink/50">{images.length}/9</span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={images.length >= 9}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-ink/10 bg-white text-ink hover:bg-blossom disabled:opacity-40"
              title="Add image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="e.g. Mark order 358dab8b as preparing, then start a 15% weekend discount"
              maxLength={2000}
              rows={2}
              className="min-h-11 resize-none rounded-2xl border-ink/10 bg-white"
            />
            <Button
              onClick={send}
              disabled={loading || (!input.trim() && images.length === 0)}
              className="h-11 rounded-2xl bg-ink px-4 text-cream hover:bg-cherry"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[0.7rem] text-ink/45">
            {thinkingCapable
              ? "GPT-5 Nano shows its thinking above each reply. Images are read at low detail to keep costs flat."
              : "Pick GPT-5 Nano to see Skippe's thinking. Images are read at low detail to keep costs flat."}
          </p>
        </div>
      </div>

      <aside className="h-[calc(100vh-9rem)] overflow-y-auto rounded-3xl border border-border/60 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">Changes this session</p>
            <h2 className="mt-1 font-display text-2xl">What Skippe did</h2>
          </div>
          <Link
            to="/staff/audit"
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-blossom px-3 py-1.5 text-xs font-semibold text-cherry hover:bg-cherry/10"
          >
            View audit log →
          </Link>
        </div>
        <p className="mt-2 text-xs text-ink/50">
          Skippe only ever touches <b>your own</b> menu items, discounts and assigned orders.
        </p>
        {runs.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {runs.map((r, i) => (
              <li
                key={i}
                className={`rounded-2xl border p-3 text-sm ${
                  r.ok ? "border-bamboo/30 bg-bamboo/5" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.summary}</span>
                  <span className="whitespace-nowrap text-[0.6rem] uppercase tracking-widest text-ink/50">
                    {r.name.replace(/_/g, " ")}
                  </span>
                </div>
                {r.detail && <p className="mt-1 text-xs text-ink/60">{r.detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
