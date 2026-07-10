import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { pandaChat } from "@/lib/panda.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Loader2, Send, Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/staff/panda")({
  head: () => ({ meta: [{ title: "Panda AI — Panda Bites Staff" }, { name: "robots", content: "noindex" }] }),
  component: PandaPage,
});

type Msg = { role: "user" | "assistant"; content: string; images?: string[] };
type Applied = { type: string; name: string; stock: number; itemId?: string; ok: boolean; error?: string };

function PandaPage() {
  const chatFn = useServerFn(pandaChat);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hi chef 🐼 — snap your fridge (up to 9 pics), tell me what you've got, and I'll update your stock. I can also look up market prices if you ask.",
    },
  ]);
  const [applied, setApplied] = useState<Applied[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const historyForServer = messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    const payload = { message: input.trim(), images: images.map((d) => ({ data_url: d })), history: historyForServer };
    setInput("");
    setImages([]);
    try {
      const res = await chatFn({ data: payload });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.applied?.length) {
        setApplied((a) => [...res.applied, ...a].slice(0, 30));
        const okCount = res.applied.filter((x) => x.ok).length;
        if (okCount > 0) toast.success(`Panda updated ${okCount} item${okCount === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Panda failed");
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I hit an error. Try again?" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-3xl border border-border/60 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-blossom to-petal px-6 py-4">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cherry">
              <Sparkles className="h-3.5 w-3.5" /> Panda · AI stock assistant
            </p>
            <h1 className="mt-1 font-display text-2xl">Snap your fridge. I'll do the rest.</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
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
                <Loader2 className="h-4 w-4 animate-spin" /> Panda is thinking…
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
              placeholder="e.g. Here's my fridge, also what's a fair valentines cake price?"
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
            <h2 className="mt-1 font-display text-2xl">What Panda touched</h2>
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