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
import {
  activitiesFromMessage,
  activitiesFromRuns,
  type SkippeActivity,
} from "@/lib/skippe-activity";
import {
  SKIPPE_MODE_OPTIONS,
  modelShowsThinking,
  MODEL_BY_MODE,
  modeSupportsVisionCapture,
  type SkippeMode,
} from "@/lib/skippe-models";
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
  Film,
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
  ssr: false,
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

function runEmoji(name: string, ok: boolean): string {
  if (!ok) return "⚠️";
  const n = name.toLowerCase();
  if (n.includes("delete")) return "🗑️";
  if (n.includes("create")) return "✨";
  if (n.includes("update") || n.includes("set_order")) return "📦";
  if (n.includes("list_menu") || n.includes("list_order")) return "📋";
  if (n.includes("discount")) return "🏷️";
  if (n.includes("priority")) return "⚡";
  if (n.includes("bulk") || n.includes("fee")) return "💰";
  return "✅";
}

/** Strip plain ✅/⚠️ lines from reply when we render RunChips instead. */
function contentWithoutRunLines(content: string, runs?: ToolRun[]): string {
  if (!runs?.length) return content;
  const lines = content.split("\n");
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^[✅⚠️✓]\s/.test(t)) return false;
    if (/^_Answered by /i.test(t)) return true;
    // drop lines that only repeat a run summary
    if (runs.some((r) => t === r.summary || t.endsWith(r.summary))) return false;
    return true;
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Clean tool-result chips — bounce in, no harsh lighting. */
function RunChips({ runs, compact = false }: { runs: ToolRun[]; compact?: boolean }) {
  return (
    <ul className={compact ? "mt-1.5 flex flex-col gap-1.5" : "mt-4 flex flex-col gap-2"}>
      {runs.map((r, idx) => (
        <motion.li
          key={`${r.name}-${idx}-${r.summary}`}
          initial={{ opacity: 0, y: 8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: Math.min(idx * 0.06, 0.4),
            type: "spring",
            stiffness: 400,
            damping: 26,
          }}
          className={
            compact
              ? `flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-xs ${
                  r.ok
                    ? "border-bamboo/25 bg-bamboo/10 text-ink"
                    : "border-destructive/25 bg-destructive/5 text-destructive"
                }`
              : `flex items-center gap-3 rounded-2xl border p-3 text-sm ${
                  r.ok
                    ? "border-bamboo/25 bg-bamboo/10"
                    : "border-destructive/25 bg-destructive/5"
                }`
          }
        >
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: Math.min(idx * 0.06, 0.4) + 0.05, type: "spring", stiffness: 480, damping: 20 }}
            className={`grid shrink-0 place-items-center rounded-xl ${
              compact ? "h-7 w-7 text-sm" : "h-9 w-9 text-base"
            } ${r.ok ? "bg-bamboo/20" : "bg-destructive/10"}`}
            aria-hidden
          >
            {runEmoji(r.name, r.ok)}
          </motion.span>
          <div className="min-w-0 flex-1">
            <p className={`leading-snug ${compact ? "font-medium" : "font-semibold"}`}>
              {r.summary}
            </p>
            {!compact && r.detail && (
              <p className="mt-0.5 text-xs text-ink/55">{r.detail}</p>
            )}
            {!compact && (
              <p className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-ink/40">
                {r.name.replace(/_/g, " ")}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full ${compact ? "h-1.5 w-1.5" : "h-2 w-2"} ${
              r.ok ? "bg-bamboo" : "bg-destructive"
            }`}
            title={r.ok ? "ok" : "failed"}
          />
        </motion.li>
      ))}
    </ul>
  );
}

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
    "Hi chef — I’m Skippe. Ask me to add or edit menu items, run discounts, or move orders pending → preparing → ready → delivered. For fridge restock: hit Fridge share (Gemini 2.5 or 3.1 Flash Lite), scroll your Bloxburg fridge — I auto-capture frames (no extra clicks). I’ll list open orders, subtract reserved stock for pending/preparing/ready unless you correct me, then create items or update stock. You can also upload up to 2 short videos.",
};

function ModeGlyph({ vendor }: { vendor: "openai" | "google" }) {
  // Fixed box so longer labels (e.g. Gemini 3.1 Flash Lite) never shrink the mark
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
      {vendor === "openai" ? (
        <ChatGptGlyph className="h-4 w-4 shrink-0" />
      ) : (
        <GoogleGlyph className="h-4 w-4 shrink-0" />
      )}
    </span>
  );
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
const SKIPPE_DRAFT_IMAGES_KEY = "pb_skippe_draft_images_v1";
const SKIPPE_RUNS_KEY = "pb_skippe_runs_v1";
const SKIPPE_INPUT_KEY = "pb_skippe_draft_input_v1";

function loadSkippeChat(): Msg[] {
  try {
    const raw = window.localStorage.getItem(SKIPPE_CHAT_KEY);
    if (!raw) return [GREETING];
    const parsed = JSON.parse(raw) as Msg[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [GREETING];
    return parsed.slice(-40).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content : "",
      thinking: typeof m.thinking === "string" ? m.thinking : undefined,
      runs: Array.isArray(m.runs) ? m.runs : undefined,
      images: Array.isArray(m.images)
        ? m.images.filter((x): x is string => typeof x === "string").slice(0, 9)
        : undefined,
    }));
  } catch {
    return [GREETING];
  }
}

function saveSkippeChat(msgs: Msg[]) {
  // Keep recent messages + images so switching tabs doesn’t wipe the thread.
  // localStorage is ~5MB — keep last 30 msgs, images only on the last few user turns.
  const recent = msgs.slice(-30);
  const slim = recent.map((m, i) => {
    const nearEnd = i >= recent.length - 8;
    return {
      role: m.role,
      content: m.content,
      thinking: m.thinking,
      runs: m.runs,
      images:
        nearEnd && m.images && m.images.length > 0
          ? m.images.slice(0, 3)
          : undefined,
    };
  });
  try {
    window.localStorage.setItem(SKIPPE_CHAT_KEY, JSON.stringify(slim));
  } catch {
    // Quota exceeded — retry without image payloads
    try {
      const noImg = slim.map(({ images: _i, ...rest }) => rest);
      window.localStorage.setItem(SKIPPE_CHAT_KEY, JSON.stringify(noImg));
    } catch {
      /* private mode */
    }
  }
}

function loadDraftImages(): string[] {
  try {
    const raw = window.sessionStorage.getItem(SKIPPE_DRAFT_IMAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.startsWith("data:"))
      .slice(0, 3);
  } catch {
    return [];
  }
}

function saveDraftImages(imgs: string[]) {
  try {
    if (imgs.length === 0) {
      window.sessionStorage.removeItem(SKIPPE_DRAFT_IMAGES_KEY);
      return;
    }
    window.sessionStorage.setItem(
      SKIPPE_DRAFT_IMAGES_KEY,
      JSON.stringify(imgs.slice(0, 3)),
    );
  } catch {
    // Quota — drop oldest until it fits
    try {
      for (let n = imgs.length - 1; n >= 1; n--) {
        try {
          window.sessionStorage.setItem(
            SKIPPE_DRAFT_IMAGES_KEY,
            JSON.stringify(imgs.slice(-n)),
          );
          return;
        } catch {
          /* keep shrinking */
        }
      }
      window.sessionStorage.removeItem(SKIPPE_DRAFT_IMAGES_KEY);
    } catch {
      /* ignore */
    }
  }
}

function loadRuns(): ToolRun[] {
  try {
    const raw = window.sessionStorage.getItem(SKIPPE_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ToolRun[];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function saveRuns(list: ToolRun[]) {
  try {
    window.sessionStorage.setItem(
      SKIPPE_RUNS_KEY,
      JSON.stringify(list.slice(0, 40)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Screen-share stream lives OUTSIDE React so a tab blur / layout remount
 * doesn’t kill the MediaStream. Browsers may still end the track themselves
 * when the surface is closed — we can’t override that — but we must not
 * call track.stop() on every component unmount.
 */
let persistentShareStream: MediaStream | null = null;
let persistentSplitOpen = false;
/** Fridge-share scroll video (MediaRecorder). Must be module-scoped — used across effects/send. */
let persistentRecorder: MediaRecorder | null = null;
let persistentRecordChunks: Blob[] = [];
let persistentRecordMime = "video/webm";

function isShareStreamLive(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live");
}

function PandaPage() {
  const chatFn = useServerFn(pandaChat);
  const qc = useQueryClient();
  // Lazy init from storage so a tab-switch remount doesn’t flash empty state
  const [messages, setMessages] = useState<Msg[]>(() =>
    typeof window !== "undefined" ? loadSkippeChat() : [GREETING],
  );
  const [runs, setRuns] = useState<ToolRun[]>(() =>
    typeof window !== "undefined" ? loadRuns() : [],
  );
  const [input, setInput] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.sessionStorage.getItem(SKIPPE_INPUT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [images, setImages] = useState<string[]>(() =>
    typeof window !== "undefined" ? loadDraftImages() : [],
  );
  const [loading, setLoading] = useState(false);
  /** Live status — system labels only, zero LLM credits. */
  const [liveActivities, setLiveActivities] = useState<SkippeActivity[]>([]);
  const [activityIndex, setActivityIndex] = useState(0);

  useEffect(() => {
    if (!loading || liveActivities.length <= 1) return;
    const id = window.setInterval(() => {
      setActivityIndex((i) => (i + 1) % liveActivities.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [loading, liveActivities]);

  const [issue, setIssue] = useState<{
    error: Error;
    context?: Record<string, unknown>;
  } | null>(null);
  const [mode, setMode] = useState<SkippeMode>(() => {
    if (typeof window === "undefined") return "lite_25";
    try {
      const stored = window.localStorage.getItem("pb_skippe_mode") as SkippeMode | null;
      if (stored && SKIPPE_MODE_OPTIONS.some((o) => o.value === stored)) return stored;
    } catch {
      /* ignore */
    }
    return "lite_25";
  });
  const [splitScreen, setSplitScreen] = useState(
    () => persistentSplitOpen || isShareStreamLive(persistentShareStream),
  );
  const [sharing, setSharing] = useState(() =>
    isShareStreamLive(persistentShareStream),
  );
  const [snapBusy, setSnapBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  // Always mirror the module-level stream so remounts pick it up
  const shareStreamRef = useRef<MediaStream | null>(persistentShareStream);

  // Persist chat, draft images, runs, input — survives tab blur / soft remounts
  useEffect(() => {
    if (messages.length === 0) return;
    saveSkippeChat(messages);
  }, [messages]);

  useEffect(() => {
    saveDraftImages(images);
  }, [images]);

  useEffect(() => {
    saveRuns(runs);
  }, [runs]);

  useEffect(() => {
    try {
      if (input) window.sessionStorage.setItem(SKIPPE_INPUT_KEY, input);
      else window.sessionStorage.removeItem(SKIPPE_INPUT_KEY);
    } catch {
      /* ignore */
    }
  }, [input]);

  // On mount: reattach any still-live share stream (survived remount)
  useEffect(() => {
    shareStreamRef.current = persistentShareStream;
    if (isShareStreamLive(persistentShareStream)) {
      setSplitScreen(true);
      setSharing(true);
      persistentSplitOpen = true;
      const el = shareVideoRef.current;
      if (el && persistentShareStream) {
        el.srcObject = persistentShareStream;
        void el.play().catch(() => {});
      }
    }
  }, []);

  // Re-bind video when returning to the tab — never stop tracks on hide
  useEffect(() => {
    const rebindShare = () => {
      if (document.visibilityState === "hidden") return;

      setMessages((prev) => (prev.length <= 1 ? loadSkippeChat() : prev));
      setImages((prev) => (prev.length === 0 ? loadDraftImages() : prev));
      setRuns((prev) => (prev.length === 0 ? loadRuns() : prev));

      const stream = persistentShareStream;
      shareStreamRef.current = stream;

      if (isShareStreamLive(stream)) {
        setSplitScreen(true);
        setSharing(true);
        persistentSplitOpen = true;
        const el = shareVideoRef.current;
        if (el && stream) {
          if (el.srcObject !== stream) el.srcObject = stream;
          void el.play().catch(() => {});
        }
      } else if (stream) {
        // Track died while we were away (browser policy) — keep panel for Resume
        persistentShareStream = null;
        shareStreamRef.current = null;
        setSharing(false);
        if (persistentSplitOpen) setSplitScreen(true);
      }
    };

    document.addEventListener("visibilitychange", rebindShare);
    window.addEventListener("pageshow", rebindShare);
    window.addEventListener("focus", rebindShare);
    return () => {
      document.removeEventListener("visibilitychange", rebindShare);
      window.removeEventListener("pageshow", rebindShare);
      window.removeEventListener("focus", rebindShare);
      // Do NOT stop tracks here — remount must not kill the share
    };
  }, []);

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
    // Fridge share / screenshots work on Auto + Gemini 2.5 + Gemini 3.1.
    // Drop live share only when switching to a mode without vision (e.g. GPT-5 Nano).
    if (!modeSupportsVisionCapture(next) && (sharing || splitScreen)) {
      stopShare();
      setSplitScreen(false);
      toast.message(
        "Fridge share closed — pick Auto, Gemini 2.5, or Gemini 3.1 Flash Lite for vision",
      );
    }
  }

  async function clearChat() {
    setMessages([GREETING]);
    saveSkippeChat([GREETING]);
    setImages([]);
    saveDraftImages([]);
    setRuns([]);
    saveRuns([]);
    setInput("");
    try {
      window.sessionStorage.removeItem(SKIPPE_INPUT_KEY);
    } catch {
      /* ignore */
    }
    toast.success("Conversation cleared");
  }

  /** Grab one frame from a <video> → JPEG data URL. Keep Content text OCR-readable. */
  function frameFromVideo(video: HTMLVideoElement): string | null {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    // 1280px longest edge — tiny 640px frames made Skippe misread / invent names
    const max = 1280;
    const scale = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch {
      return null;
    }
  }

  /** Wait until video has real dimensions (or timeout). */
  function waitForVideoReady(
    video: HTMLVideoElement,
    timeoutMs = 4000,
  ): Promise<boolean> {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(tick);
      };
      video.addEventListener("loadeddata", () => tick(), { once: true });
      video.addEventListener("loadedmetadata", () => tick(), { once: true });
      tick();
    });
  }

  /** Pull evenly spaced frames from an uploaded video file. */
  async function framesFromVideoFile(
    file: File,
    maxFrames: number,
  ): Promise<string[]> {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Couldn’t read that video"));
      });

      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : 1;
      const count = Math.max(1, Math.min(maxFrames, 9));
      const out: string[] = [];

      for (let i = 0; i < count; i++) {
        const t = Math.min(duration * ((i + 0.5) / count), Math.max(0, duration - 0.05));
        video.currentTime = t;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
        });
        const frame = frameFromVideo(video);
        if (frame) out.push(frame);
      }
      return out;
    } finally {
      URL.revokeObjectURL(url);
      video.src = "";
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    let remaining = 9 - images.length;
    if (remaining <= 0) {
      toast.error("Max 3 images — remove one first");
      return;
    }

    const next: string[] = [];
    for (const file of Array.from(files)) {
      if (remaining <= 0) break;

      if (file.type.startsWith("video/")) {
        if (!requireVisionCapture()) return;
        toast.message(`Reading video frames from ${file.name}…`);
        try {
          const frames = await framesFromVideoFile(file, remaining);
          next.push(...frames);
          remaining -= frames.length;
          if (frames.length === 0) {
            toast.error("No frames could be read from that video");
          } else {
            toast.success(
              `Added ${frames.length} frame${frames.length === 1 ? "" : "s"} from video`,
            );
          }
        } catch (err) {
          console.error(err);
          toast.error(
            err instanceof Error ? err.message : "Video read failed",
          );
        }
        continue;
      }

      if (file.type.startsWith("image/") || file.type === "") {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        next.push(dataUrl);
        remaining -= 1;
      }
    }

    if (next.length > 0) {
      setImages((prev) => [...prev, ...next].slice(0, 3));
    }
  }

  function stopShare() {
    try {
      if (persistentRecorder && persistentRecorder.state !== "inactive") {
        persistentRecorder.stop();
      }
    } catch {
      /* ignore */
    }
    persistentRecorder = null;
    // Keep chunks until Send can finalize; cleared after frames extracted
    persistentShareStream?.getTracks().forEach((t) => t.stop());
    persistentShareStream = null;
    shareStreamRef.current = null;
    if (shareVideoRef.current) {
      shareVideoRef.current.srcObject = null;
    }
    setSharing(false);
  }

  // Keep <video> attached whenever share is live and the panel is open
  useEffect(() => {
    const stream = persistentShareStream ?? shareStreamRef.current;
    if (!sharing || !splitScreen || !isShareStreamLive(stream)) return;
    let cancelled = false;

    const attach = async () => {
      for (let i = 0; i < 30 && !cancelled; i++) {
        const el = shareVideoRef.current;
        if (el && stream) {
          if (el.srcObject !== stream) {
            el.srcObject = stream;
          }
          try {
            await el.play();
          } catch {
            /* muted autoplay */
          }
          const ready = await waitForVideoReady(el, 1500);
          if (ready) return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    };

    void attach();
    return () => {
      cancelled = true;
    };
  }, [sharing, splitScreen]);

  // Fridge share = continuous VIDEO of the scroll (not sparse stills).
  // Fast scrolling misses items with 2.5s snapshots; a recording does not.
  // On Send we sample dense frames from the recorded clip.
  useEffect(() => {
    if (!sharing || !splitScreen) return;
    const stream = shareStreamRef.current || persistentShareStream;
    if (!stream) return;

    // Already recording
    if (persistentRecorder && persistentRecorder.state !== "inactive") return;

    const mimeCandidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mime =
      mimeCandidates.find((m) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
      ) || "";
    if (!mime || typeof MediaRecorder === "undefined") {
      // Fallback: denser still capture if MediaRecorder unavailable
      const id = window.setInterval(() => {
        const video = shareVideoRef.current;
        if (!video || video.videoWidth === 0) return;
        setImages((prev) => {
          if (prev.length >= 9) return prev;
          const dataUrl = frameFromVideo(video);
          if (!dataUrl) return prev;
          if (prev.length > 0 && prev[prev.length - 1] === dataUrl) return prev;
          return [...prev, dataUrl].slice(0, 9);
        });
      }, 400);
      return () => window.clearInterval(id);
    }

    persistentRecordChunks = [];
    persistentRecordMime = mime;
    try {
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 1_200_000,
      });
      persistentRecorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) persistentRecordChunks.push(e.data);
      };
      rec.start(500); // timeslice so we keep data even if share ends abruptly
      toast.message("Recording fridge scroll as video — scroll the Content list, then Send");
    } catch (err) {
      console.error(err);
      persistentRecorder = null;
    }

    return () => {
      // Don't stop on effect cleanup during normal share — stopShare handles it.
    };
  }, [sharing, splitScreen]);

  /**
   * One-shot screenshot via the browser share picker (pick window / screen).
   * Prefer a *different* window than Skippe — capturing this tab often goes black.
   */
  async function captureScreenshot() {
    if (!requireVisionCapture()) return;
    if (images.length >= 3) {
      toast.error("Max 3 images — remove one first");
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
        video: {
          // Prefer a window/monitor — not the Skippe tab itself
          displaySurface: "window",
          frameRate: 10,
        } as MediaTrackConstraints,
        audio: false,
        // @ts-expect-error — Chrome extension of getDisplayMedia options
        preferCurrentTab: false,
        // @ts-expect-error
        selfBrowserSurface: "exclude",
        // @ts-expect-error
        surfaceSwitching: "include",
        // @ts-expect-error
        systemAudio: "exclude",
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.srcObject = stream;
      await video.play();
      const ready = await waitForVideoReady(video, 5000);
      if (!ready) {
        toast.error(
          "Capture stayed blank — pick your game window (not this Skippe tab)",
        );
        return;
      }
      // Extra paint so the first frame isn’t empty on some GPUs
      await new Promise((r) => setTimeout(r, 120));
      const dataUrl = frameFromVideo(video);
      video.pause();
      video.srcObject = null;
      if (!dataUrl) {
        toast.error(
          "Couldn’t grab that frame — try “Window” (Roblox) instead of “This tab”",
        );
        return;
      }
      setImages((prev) => [...prev, dataUrl].slice(0, 3));
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
   * Live split-screen share of another window (e.g. full Bloxburg fridge).
   * Snap frames into the image tray — Skippe reads those on Send.
   */
  async function startFridgeShare() {
    if (!requireVisionCapture()) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen share isn’t supported in this browser");
      return;
    }
    try {
      // Open the panel first so the <video> exists when the stream arrives
      setSplitScreen(true);
      persistentSplitOpen = true;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "window",
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        } as MediaTrackConstraints,
        audio: false,
        // @ts-expect-error Chrome options
        preferCurrentTab: false,
        // @ts-expect-error
        selfBrowserSurface: "exclude",
        // @ts-expect-error
        surfaceSwitching: "include",
        // @ts-expect-error
        systemAudio: "exclude",
      });

      // Replace previous share only after we got a new one
      if (persistentShareStream && persistentShareStream !== stream) {
        persistentShareStream.getTracks().forEach((t) => t.stop());
      }
      persistentShareStream = stream;
      shareStreamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        // Browser ended the surface (user clicked Stop sharing, or closed window).
        // Do not treat this as “clear chat” — only clear the live stream.
        if (persistentShareStream === stream) {
          persistentShareStream = null;
        }
        shareStreamRef.current = null;
        if (shareVideoRef.current) shareVideoRef.current.srcObject = null;
        setSharing(false);
        persistentSplitOpen = true;
        setSplitScreen(true);
        toast.message(
          "Live share stopped. Chat & snaps are kept — hit Resume and pick the game window again.",
        );
      });

      // Some browsers fire mute while the tab is hidden — don’t kill the stream
      track?.addEventListener("mute", () => {
        /* expected while backgrounded */
      });
      track?.addEventListener("unmute", () => {
        const el = shareVideoRef.current;
        if (el && persistentShareStream) {
          el.srcObject = persistentShareStream;
          void el.play().catch(() => {});
        }
        setSharing(true);
      });

      setSharing(true);

      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (shareVideoRef.current) {
        shareVideoRef.current.srcObject = stream;
        try {
          await shareVideoRef.current.play();
        } catch {
          /* muted autoplay */
        }
        const ready = await waitForVideoReady(shareVideoRef.current, 5000);
        if (!ready) {
          toast.message(
            "Share is connected but still loading — wait a second, then Snap",
          );
        } else {
          toast.success(
            "Fridge share live — leave this tab if needed; stream stays until you Stop",
          );
        }
      } else {
        toast.success("Fridge share started");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.message("Screen share cancelled");
        if (!isShareStreamLive(persistentShareStream)) {
          setSplitScreen(false);
          persistentSplitOpen = false;
        }
      } else {
        toast.error("Couldn’t start screen share");
        console.error(err);
      }
    }
  }

  async function snapFromShare() {
    if (images.length >= 3) {
      toast.error("Max 3 images — remove one first");
      return;
    }
    const video = shareVideoRef.current;
    if (!video || !sharing) {
      toast.error("Start fridge share first");
      return;
    }
    if (video.videoWidth === 0) {
      const ready = await waitForVideoReady(video, 3000);
      if (!ready) {
        toast.error(
          "Share is still blank — pick the Roblox/Bloxburg window, not this tab",
        );
        return;
      }
    }
    const dataUrl = frameFromVideo(video);
    if (!dataUrl) {
      toast.error("Couldn’t snap — try Resume share on the game window");
      return;
    }
    setImages((prev) => [...prev, dataUrl].slice(0, 3));
    toast.success("Frame snapped for Skippe");
  }


  /** Dense frames from a recorded fridge-scroll video (or uploaded file). */
  async function framesFromBlob(
    blob: Blob,
    maxFrames = 9,
  ): Promise<string[]> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Couldn’t read fridge video"));
      });
      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(video.duration, 45) // cap long shares
          : 1;
      // Aim ~1 frame every 0.4s so fast scrolls still land items
      const byTime = Math.max(1, Math.ceil(duration / 0.4));
      const count = Math.max(1, Math.min(maxFrames, byTime, 9));
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = Math.min(
          duration * ((i + 0.5) / count),
          Math.max(0, duration - 0.05),
        );
        video.currentTime = t;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
        });
        const frame = frameFromVideo(video);
        if (frame) out.push(frame);
      }
      return out;
    } finally {
      URL.revokeObjectURL(url);
      video.src = "";
    }
  }

  async function finalizeFridgeRecording(): Promise<string[]> {
    const rec = persistentRecorder;
    if (!rec || rec.state === "inactive") {
      // Fall back to whatever stills are already in the tray
      return [];
    }
    const blob: Blob = await new Promise((resolve) => {
      rec.onstop = () => {
        resolve(
          new Blob(persistentRecordChunks, {
            type: persistentRecordMime || "video/webm",
          }),
        );
      };
      try {
        if (rec.state === "recording") rec.requestData();
        rec.stop();
      } catch {
        resolve(
          new Blob(persistentRecordChunks, {
            type: persistentRecordMime || "video/webm",
          }),
        );
      }
    });
    persistentRecorder = null;
    persistentRecordChunks = [];
    if (!blob || blob.size < 1000) return [];
    toast.message("Reading your fridge scroll video…");
    return framesFromBlob(blob, 9);
  }

  async function send() {
    // Prefer fridge-scroll VIDEO → dense frames (captures fast scrolling)
    let tray = images.filter(
      (d) => typeof d === "string" && d.startsWith("data:image/"),
    );
    if (sharing || (persistentRecorder && persistentRecorder.state !== "inactive")) {
      try {
        const fromVideo = await finalizeFridgeRecording();
        if (fromVideo.length > 0) {
          tray = fromVideo;
          setImages(fromVideo);
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (!input.trim() && tray.length === 0) return;

    // If the chef refers to prior pictures ("add these", "in the picture") but
    // the tray is empty, re-attach the most recent user images from chat so
    // Skippe can still see them (models only receive images on the current turn).
    const text = input.trim();
    const refersToPriorImages =
      /\b(these|those|the picture|the photo|the image|same picture|from (the )?picture|in (the )?picture|menu items in the picture)\b/i.test(
        text,
      ) ||
      (/\b(add|create|import|use)\b/i.test(text) &&
        /\b(picture|photo|image|screenshot|above)\b/i.test(text));

    let sendImages = tray.slice(0, 9);
    if (sendImages.length === 0 && refersToPriorImages) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.role === "user" && m.images && m.images.length > 0) {
          sendImages = m.images
            .filter((d) => typeof d === "string" && d.startsWith("data:image/"))
            .slice(0, 9);
          break;
        }
      }
    }

    if (sendImages.length === 0 && !text) {
      toast.error("No fridge video/frames — Fridge share the Roblox window, scroll Content, then Send");
      return;
    }
    const userMsg: Msg = {
      role: "user",
      content:
        text ||
        (sendImages.length
          ? "Scan this Bloxburg fridge Content scroll (video frames). Add/update menu stock from every row you can read."
          : ""),
      images: [...sendImages],
    };
    setMessages((m) => [...m, userMsg]);
    setLiveActivities(
      activitiesFromMessage(userMsg.content, sendImages.length),
    );
    setActivityIndex(0);
    setLoading(true);
    // Keep more history so Skippe can follow multi-step kitchen jobs
    const historyWindow = 12;
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-historyWindow)
      .map((m) => {
        const imgNote =
          m.role === "user" && m.images && m.images.length > 0
            ? `\n[Attached ${m.images.length} image(s) in that message — if the chef refers back to them, they may be re-sent on a later turn.]`
            : "";
        return {
          role: m.role as "user" | "assistant",
          content: (m.content + imgNote).slice(0, 2000),
        };
      });
    const payload = {
      message:
        text +
        (tray.length === 0 && sendImages.length > 0
          ? "\n\n(Re-attached the previous picture(s) from this chat so you can still see them.)"
          : ""),
      images: sendImages.map((d) => ({ data_url: d })),
      mode,
      history,
    };
    setInput("");
    setImages([]);
    try {
      const res = await chatFn({ data: payload });
      // Prefer real tool names for a final status flash (still no LLM)
      const fromRuns = activitiesFromRuns(res.runs ?? []);
      if (fromRuns.length) {
        setLiveActivities(fromRuns);
        setActivityIndex(0);
      }
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
      setLiveActivities([]);
    }
  }

  const activeModel = mode === "auto" ? "" : MODEL_BY_MODE[mode];
  const thinkingCapable = activeModel ? modelShowsThinking(activeModel) : false;
  // Vision capture on Auto + Gemini 2.5 + Gemini 3.1 (Google path). GPT-5 Nano is chat/tools only.
  const visionCaptureAllowed = modeSupportsVisionCapture(mode);

  function requireVisionCapture(): boolean {
    if (visionCaptureAllowed) return true;
    toast.message(
      "Screenshot, fridge share & video frames need Auto, Gemini 2.5, or Gemini 3.1 Flash Lite",
    );
    return false;
  }

  return (
    <div
      className={`grid gap-6 ${
        splitScreen
          ? "lg:grid-cols-[1.15fr_0.95fr_0.85fr]"
          : "lg:grid-cols-[1.4fr_1fr]"
      }`}
    >
      {/* Thinking status — readable text + soft sparkle (zero LLM credits) */}
      <style>{`
        @keyframes skippe-shine {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes skippe-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes skippe-dot {
          0%, 80%, 100% { transform: scale(0.65); opacity: 0.35; }
          40% { transform: scale(1); opacity: 1; }
        }
        /* Base text stays solid; shine is a soft highlight layer */
        .skippe-shine {
          position: relative;
          display: inline-block;
          color: rgba(40, 30, 35, 0.78);
          -webkit-text-fill-color: rgba(40, 30, 35, 0.78);
        }
        .skippe-shine::after {
          content: attr(data-text);
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-image: linear-gradient(
            105deg,
            transparent 0%,
            transparent 38%,
            rgba(255, 255, 255, 0.85) 50%,
            transparent 62%,
            transparent 100%
          );
          background-size: 220% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: skippe-shine 2.4s linear infinite;
          pointer-events: none;
        }
        .skippe-bob { animation: skippe-bob 1.8s ease-in-out infinite; }
        .skippe-dot { animation: skippe-dot 1.25s ease-in-out infinite; }
        .skippe-dot:nth-child(2) { animation-delay: 0.15s; }
        .skippe-dot:nth-child(3) { animation-delay: 0.3s; }
        @media (prefers-reduced-motion: reduce) {
          .skippe-shine::after { animation: none; opacity: 0; }
          .skippe-bob, .skippe-dot { animation: none; }
        }
      `}</style>
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
                  persistentSplitOpen = false;
                } else if (splitScreen) {
                  setSplitScreen(false);
                  persistentSplitOpen = false;
                } else {
                  void startFridgeShare();
                }
              }}
              disabled={!visionCaptureAllowed && !splitScreen}
              className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                splitScreen
                  ? "border-cherry/40 bg-cherry/10 text-cherry"
                  : "border-ink/10 bg-card text-ink/70 hover:bg-petal"
              }`}
              title={
                visionCaptureAllowed
                  ? "Split screen — share your Bloxburg fridge (or any window)"
                  : "Switch model to Auto, Gemini 2.5, or Gemini 3.1 Flash Lite for fridge share"
              }
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
              <SelectTrigger className="h-11 w-[17.5rem] shrink-0 rounded-2xl border-ink/10 bg-white text-left text-sm font-semibold [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2 [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {SKIPPE_MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-xl py-2.5">
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <ModeGlyph vendor={o.vendor} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{o.label}</span>
                      <span className="ml-auto shrink-0 pl-3 text-xs text-ink/50">Cost: {o.cost}</span>
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
                  {(() => {
                    const body = contentWithoutRunLines(m.content, m.runs);
                    return body ? (
                      <p className="whitespace-pre-wrap">{body}</p>
                    ) : null;
                  })()}
                  {m.runs && m.runs.length > 0 && (
                    <div className={m.content ? "mt-2" : ""}>
                      <RunChips runs={m.runs} compact />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start py-1"
                aria-live="polite"
              >
                <div className="flex max-w-[90%] items-center gap-3 rounded-2xl border border-cherry/15 bg-blossom/80 px-3.5 py-2.5 shadow-sm">
                  <div className="skippe-bob grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cherry/12 text-base">
                    {liveActivities[activityIndex]?.emoji ?? "💭"}
                  </div>
                  <div className="min-w-0">
                    <p
                      key={liveActivities[activityIndex]?.id ?? "on-it"}
                      className="skippe-shine text-sm font-medium leading-snug"
                      data-text={liveActivities[activityIndex]?.label ?? "Skippe is on it"}
                    >
                      {liveActivities[activityIndex]?.label ?? "Skippe is on it"}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="skippe-dot h-1.5 w-1.5 rounded-full bg-cherry/70" />
                      <span className="skippe-dot h-1.5 w-1.5 rounded-full bg-cherry/70" />
                      <span className="skippe-dot h-1.5 w-1.5 rounded-full bg-cherry/70" />
                    </div>
                  </div>
                </div>
              </motion.div>
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
              <span className="ml-1 self-end text-xs text-ink/50">{images.length}/3</span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={images.length >= 3}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-ink/10 bg-card text-ink hover:bg-petal disabled:opacity-40"
              title="Upload images or a video (video → frames for Skippe)"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!requireVisionCapture()) return;
                if (fileRef.current) {
                  fileRef.current.accept = "video/*";
                  fileRef.current.click();
                  window.setTimeout(() => {
                    if (fileRef.current) {
                      fileRef.current.accept = "image/*,video/*";
                    }
                  }, 500);
                }
              }}
              disabled={!visionCaptureAllowed || images.length >= 3}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-ink/10 bg-card text-ink hover:bg-petal disabled:opacity-40"
              title={
                visionCaptureAllowed
                  ? "Upload a video — Skippe reads several frames"
                  : "Switch to Auto, Gemini 2.5, or Gemini 3.1 Flash Lite for video frames"
              }
            >
              <Film className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void captureScreenshot()}
              disabled={
                !visionCaptureAllowed || images.length >= 3 || snapBusy
              }
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-ink/10 bg-card text-ink hover:bg-petal disabled:opacity-40"
              title={
                visionCaptureAllowed
                  ? "Screenshot a window/screen for Skippe"
                  : "Switch to Auto, Gemini 2.5, or Gemini 3.1 Flash Lite for screenshots"
              }
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
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files);
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
            {visionCaptureAllowed ? (
              <>
                📷 Screenshot / 🖥️ Fridge share / 🎬 Video frames work on{" "}
                <b>Auto</b>, <b>Gemini 2.5 Flash Lite ($)</b>, and{" "}
                <b>Gemini 3.1 Flash Lite ($$)</b>. Pick the{" "}
                <b>Roblox/game window</b> (not this tab). Max 9 frames.
              </>
            ) : (
              <>
                Switch the model to <b>Auto</b>, <b>Gemini 2.5</b>, or{" "}
                <b>Gemini 3.1 Flash Lite</b> to unlock screenshot, fridge share,
                and video frames.
              </>
            )}
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
                  disabled={images.length >= 3}
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
                  persistentSplitOpen = false;
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
            Share the Roblox/Bloxburg window (not this tab). Open fridge → View
            Content, then scroll the list — Skippe records your scroll as video
            so fast scrolling doesn&apos;t miss items. On Send it reads up to 9
            frames from that clip. Snap still works for a single frame.
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
          <p className="mt-6 text-sm text-muted-foreground">No changes yet — ask Skippe to cook something up.</p>
        ) : (
          <RunChips runs={runs} />
        )}
      </aside>
    </div>
  );
}
