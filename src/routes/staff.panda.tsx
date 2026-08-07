import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { pandaChat, listSkippeChat, clearSkippeChat, type SkippeMode } from "@/lib/panda.functions";
import { GoogleGlyph } from "@/components/google-glyph";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagePlus, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/staff/panda")({
  head: () => ({
    meta: [
      { title: "Skippe AI — Panda Bites Staff" },
      { name: "description", content: "Scan and update your own Panda Bites chef menu with Skippe." },
      { property: "og:title", content: "Skippe AI — Panda Bites Staff" },
      { property: "og:description", content: "AI menu scanning for Panda Bites chefs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PandaPage,
});

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };
type Applied = { type: string; name: string; stock: number; itemId?: string; ok: boolean; error?: string };

const MODE_OPTIONS: Array<{ value: SkippeMode; label: string; cost: string }> = [
  { value: "auto", label: "Auto", cost: "$-$$" },
  { value: "lite_25", label: "Gemini 2.5 Flash Lite", cost: "$" },
  { value: "lite_31", label: "Gemini 3.1 Flash Lite", cost: "$$" },
];

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi chef — I’m Skippe. Snap your menu or fridge (up to 9 pics) and I’ll add item names, update stock, and put items live. You always set every price yourself.",
};

function PandaPage() {
  const chatFn = useServerFn(pandaChat);
  const listFn = useServerFn(listSkippeChat);
  const clearFn = useServerFn(clearSkippeChat);
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [applied, setApplied] = useState<Applied[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SkippeMode>("auto");
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const { data: saved } = useQuery({ queryKey: ["skippe-chat"], queryFn: () => listFn() });

  // Restore the saved thread once it arrives.
  useEffect(() => {
    if (!saved) return;
    setMessages(
      saved.length === 0
        ? [GREETING]
        : [GREETING, ...saved.map((m) => ({ role: m.role, content: m.content }))],
    );
  }, [saved]);

  // Remember the chosen mode between sessions.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("pb_skippe_mode") as SkippeMode | null;
      if (stored && MODE_OPTIONS.some((o) => o.value === stored)) setMode(stored);
    } catch {
      /* storage unavailable */
    }
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
  }

  async function clearChat() {
    if (!confirm("Clear your whole conversation with Skippe?")) return;
    try {
      await clearFn({});
      setMessages([GREETING]);
      qc.invalidateQueries({ queryKey: ["skippe-chat"] });
      toast.success("Conversation cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the conversation");
    }
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
    const historyForServer = messages.map((m) => ({ role: m.role, content: m.content }));
    void historyForServer; // conversation memory now lives server-side
    const payload = { message: input.trim(), images: images.map((d) => ({ data_url: d })), mode };
    setInput("");
    setImages([]);
    try {
      const res = await chatFn({ data: payload });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.auto ? `${res.reply}\n\n_Answered by ${res.model_label}._` : res.reply },
      ]);
      qc.invalidateQueries({ queryKey: ["skippe-chat"] });
      if (res.applied?.length) {
        setApplied((a) => [...res.applied, ...a].slice(0, 30));
        const okCount = res.applied.filter((x) => x.ok).length;
        if (okCount > 0) toast.success(`Skippe updated ${okCount} item${okCount === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Skippe failed");
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I hit an error. Try again?" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-3xl border border-border/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-blossom to-petal px-6 py-4">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cherry">
               <Sparkles className="h-3.5 w-3.5" /> Skippe · AI menu assistant
            </p>
            <h1 className="mt-1 font-display text-2xl">Snap your fridge. I'll do the rest.</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={mode} onValueChange={(v) => pickMode(v as SkippeMode)}>
              <SelectTrigger className="h-11 w-[16.5rem] rounded-2xl border-ink/10 bg-white text-left text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-xl py-2.5">
                    <span className="flex w-full items-center gap-2">
                      <GoogleGlyph />
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
                    m.role === "user"
                      ? "bg-ink text-cream"
                      : "bg-blossom text-ink"
                  }`}
                >
                  {m.images && m.images.length > 0 && (
                    <div className="mb-2 grid grid-cols-3 gap-1">
                      {m.images.map((img, idx) => (
                        <img key={idx} src={img} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
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
              onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
            />
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
               placeholder="e.g. Scan these items and update my stock"
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
        </div>
      </div>

      <aside className="h-[calc(100vh-9rem)] overflow-y-auto rounded-3xl border border-border/60 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">Changes this session</p>
             <h2 className="mt-1 font-display text-2xl">What Skippe changed</h2>
          </div>
          <Link
            to="/staff/audit"
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-blossom px-3 py-1.5 text-xs font-semibold text-cherry hover:bg-cherry/10"
          >
            View audit log →
          </Link>
        </div>
        <p className="mt-2 text-xs text-ink/50">
          New items are added with price <b>B$0</b> and stay hidden until you set a price.
        </p>
        {applied.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {applied.map((a, i) => (
              <li
                key={i}
                className={`rounded-2xl border p-3 text-sm ${
                  a.ok ? "border-bamboo/30 bg-bamboo/5" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs uppercase tracking-widest text-ink/50">
                    {a.type === "add_item" ? "new" : "stock"}
                  </span>
                </div>
                <p className="text-xs text-ink/60">
                  {a.ok ? `stock → ${a.stock}` : a.error ?? "failed"}
                </p>
                {a.ok && a.type === "add_item" && (
                  <Link
                    to="/staff/menu"
                    className="mt-1 inline-block text-xs font-semibold text-cherry underline"
                  >
                    Set price →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}