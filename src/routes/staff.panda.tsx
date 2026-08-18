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
import {
  Brain,
  Camera,
  ChevronDown,
  ImagePlus,
  Loader2,
  Monitor,
  MonitorOff,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

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
  const [mode, setMode] = useState<SkippeMode>("lite_25");
  const [splitScreen, setSplitScreen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const shareStreamRef = useRef<MediaStream | null>(null);

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

  function stopShare() {
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current = null;
    if (shareVideoRef.current) {
      shareVideoRef.current.srcObject = null;
    }
    setSharing(false);
  }

  useEffect(() => {
    return () => {
      shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Attach stream when the split-screen video element mounts
  useEffect(() => {
    if (!sharing || !shareStreamRef.current || !shareVideoRef.current) return;
    shareVideoRef.current.srcObject = shareStreamRef.current;
    void shareVideoRef.current.play().catch(() => {});
  }, [sharing, splitScreen]);

  /** Grab one frame from a live MediaStream → data URL. */
  function frameFromVideo(video: HTMLVideoElement): string | null {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    // Cap longest side so Skippe image payloads stay reasonable
    const max = 1280;
    const scale = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  /**
   * One-shot screenshot via the browser share picker (pick tab / window / screen).
   * Use this to capture your Bloxburg fridge without a phone photo.
   */
  async function captureScreenshot() {
    if (images.length >= 9) {
      toast.error("Max 9 images — remove one first");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen capture isn’t supported in this browser");
      return;
    }
    setSnapBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      // Wait one frame so dimensions populate
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = frameFromVideo(video);
      video.pause();
      video.srcObject = null;
      if (!dataUrl) {
        toast.error("Couldn’t grab that frame — try again");
        return;
      }
      setImages((prev) => [...prev, dataUrl].slice(0, 9));
      toast.success("Screenshot added for Skippe");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.message("Screen capture cancelled");
      } else {
        toast.error("Screenshot failed");
        console.error(err);
      }
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setSnapBusy(false);
    }
  }

  /**
   * Live split-screen share: keep a window/screen open (e.g. full fridge view)
   * and snap frames into Skippe’s image tray whenever you want.
   */
  async function startFridgeShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen share isn’t supported in this browser");
      return;
    }
    try {
      stopShare();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      shareStreamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopShare();
        toast.message("Screen share ended");
      });
      setSplitScreen(true);
      setSharing(true);
      // Attach after state so the video element is mounted
      requestAnimationFrame(() => {
        if (shareVideoRef.current) {
          shareVideoRef.current.srcObject = stream;
          void shareVideoRef.current.play().catch(() => {});
        }
      });
      toast.success("Fridge share live — snap frames into Skippe anytime");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.message("Screen share cancelled");
      } else {
        toast.error("Couldn’t start screen share");
        console.error(err);
      }
    }
  }

  function snapFromShare() {
    if (images.length >= 9) {
      toast.error("Max 9 images — remove one first");
      return;
    }
    const video = shareVideoRef.current;
    if (!video || !sharing) {
      toast.error("Start fridge share first");
      return;
    }
    const dataUrl = frameFromVideo(video);
    if (!dataUrl) {
      toast.error("Wait a moment for the share to load");
      return;
    }
    setImages((prev) => [...prev, dataUrl].slice(0, 9));
    toast.success("Frame snapped for Skippe");
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
          content: `${res.reply}\n\n_Answered by ${res.model_label}._`,
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
    <div
      className={`grid gap-6 ${
        splitScreen
          ? "lg:grid-cols-[1.15fr_0.95fr_0.85fr]"
          : "lg:grid-cols-[1.4fr_1fr]"
      }`}
    >
      <div className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-blossom to-petal px-6 py-4">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cherry">
              <Sparkles className="h-3.5 w-3.5" /> Skippe · AI kitchen assistant
            </p>
            <h1 className="mt-1 font-display text-2xl">Ask me to run your kitchen.</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (splitScreen && sharing) {
                  stopShare();
                  setSplitScreen(false);
                } else if (splitScreen) {
                  setSplitScreen(false);
                } else {
                  void startFridgeShare();
                }
              }}
              className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${
                splitScreen
                  ? "border-cherry/40 bg-cherry/10 text-cherry"
                  : "border-ink/10 bg-card text-ink/70 hover:bg-petal"
              }`}
              title="Split screen — share your Bloxburg fridge (or any window)"
            >
              {sharing ? (
                <MonitorOff className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {sharing ? "Stop share" : "Fridge share"}
              </span>
            </button>
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
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-ink/10 bg-card text-ink hover:bg-petal disabled:opacity-40"
              title="Upload image from device"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void captureScreenshot()}
              disabled={images.length >= 9 || snapBusy}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-ink/10 bg-card text-ink hover:bg-petal disabled:opacity-40"
              title="Screenshot a tab/window/screen for Skippe"
            >
              {snapBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
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
              ? "GPT-5 Nano shows its thinking above each reply. Camera = in-browser screenshot · Fridge share = live split view of another window."
              : "Camera = screenshot a tab/window · Fridge share = split-screen live view (snap frames for Skippe)."}
          </p>
        </div>
      </div>

      {/* Live split-screen share (Bloxburg fridge / any window) */}
      {splitScreen && (
        <aside className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-3xl border border-border/60 bg-ink text-cream shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-cream/10 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cherry">
                Live share
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {sharing ? "Fridge / screen feed" : "Share paused"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {sharing ? (
                <button
                  type="button"
                  onClick={snapFromShare}
                  disabled={images.length >= 9}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cherry px-3 text-xs font-bold text-cream hover:bg-cherry/90 disabled:opacity-40"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Snap for Skippe
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startFridgeShare()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cream/10 px-3 text-xs font-bold text-cream hover:bg-cream/15"
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  stopShare();
                  setSplitScreen(false);
                }}
                className="grid h-9 w-9 place-items-center rounded-xl bg-cream/10 text-cream/80 hover:bg-cream/15"
                aria-label="Close split screen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-2">
            {sharing ? (
              <video
                ref={shareVideoRef}
                muted
                playsInline
                autoPlay
                className="max-h-full max-w-full rounded-xl object-contain"
              />
            ) : (
              <p className="px-6 text-center text-sm text-cream/50">
                Share ended. Hit <b>Resume</b> or <b>Fridge share</b> to pick a
                window again (e.g. full Bloxburg fridge).
              </p>
            )}
          </div>
          <p className="border-t border-cream/10 px-4 py-2 text-[11px] text-cream/45">
            Browser will ask which tab/window/screen to share. Pick your game
            window so Skippe can read the fridge from snaps — nothing is
            uploaded until you send a chat message.
          </p>
        </aside>
      )}

      <aside className="h-[calc(100vh-9rem)] overflow-y-auto rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
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
