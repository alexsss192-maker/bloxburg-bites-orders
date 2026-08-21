import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { listAllMenu, upsertMenuItem, deleteMenuItem } from "@/lib/menu.functions";
import { pandaChat } from "@/lib/panda.functions";
import {
  SKIPPE_MODE_OPTIONS,
  type SkippeMode,
} from "@/lib/skippe-models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StockAlertsPanel } from "@/components/stock-alerts-panel";
import { GoogleGlyph } from "@/components/google-glyph";

export const Route = createFileRoute("/staff/menu")({
  head: () => ({
    meta: [
      { title: "My Chef Menu — Panda Bites" },
      {
        name: "description",
        content: "Manage your private Panda Bites chef menu.",
      },
      { property: "og:title", content: "My Chef Menu — Panda Bites" },
      {
        property: "og:description",
        content: "Manage a Panda Bites chef menu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MenuEditor,
});

type Item = {
  id: string;
  name: string;
  description: string;
  price_bs: number;
  stock: number;
  image_url: string | null;
  category: "non_seasonal" | "seasonal";
  is_active: boolean;
  owner_id?: string | null;
};

const emptyItem: Partial<Item> = {
  name: "",
  description: "",
  price_bs: 0,
  stock: 0,
  image_url: "",
  category: "non_seasonal",
  is_active: true,
};

/** Menu-editor Skippe: Auto + Gemini 2.5 + Gemini 3.1 only (no GPT-5 Nano). */
const MENU_SKIPPE_MODES = SKIPPE_MODE_OPTIONS.filter(
  (o) => o.value === "auto" || o.value === "lite_25" || o.value === "lite_31",
);

const SKIPPE_PLACEHOLDERS = [
  "Add Heart Shaped Pizza as a seasonal with a stock of 93",
  "Remove spooky cake pops",
  "Add Donuts as a non-seasonal with a stock of 64",
  "Set stock of Heart Cake to 24",
  "Hide New Year's Cake from the menu",
];

type SkippePromptKind =
  | "edit"
  | "delete"
  | "deactivate"
  | "restock"
  | "seasonal";

type PendingPrompt = {
  kind: SkippePromptKind;
  item: Item;
  title: string;
  placeholder: string;
  build: (extra: string) => string;
};

/** Skippe creates at B$0 — treat zero-price items as Skippe-stocked. */
function isSkippeStocked(item: Item): boolean {
  return item.price_bs <= 0;
}

function MenuEditor() {
  const listFn = useServerFn(listAllMenu);
  const upsertFn = useServerFn(upsertMenuItem);
  const delFn = useServerFn(deleteMenuItem);
  const chatFn = useServerFn(pandaChat);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["staff-menu"],
    queryFn: () => listFn(),
  });
  const [editing, setEditing] = useState<Partial<Item> | null>(null);

  const [skippeMode, setSkippeMode] = useState<SkippeMode>("lite_25");
  const [skippeInput, setSkippeInput] = useState("");
  const [skippeBusy, setSkippeBusy] = useState(false);
  const [skippeLastReply, setSkippeLastReply] = useState<string | null>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(
    null,
  );
  const [promptExtra, setPromptExtra] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % SKIPPE_PLACEHOLDERS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  const activePlaceholder = SKIPPE_PLACEHOLDERS[placeholderIdx];

  async function runSkippeMessage(message: string) {
    const text = message.trim();
    if (!text || skippeBusy) return;
    setSkippeBusy(true);
    setSkippeLastReply(null);
    try {
      const res = await chatFn({
        data: {
          message: text,
          images: [],
          mode: skippeMode,
          history: [],
        },
      });
      setSkippeLastReply(res.reply);
      const ok = (res.runs ?? []).filter((r) => r.ok).length;
      if (ok > 0) {
        toast.success(`Skippe made ${ok} change${ok === 1 ? "" : "s"}`);
      } else {
        toast.message("Skippe replied");
      }
      qc.invalidateQueries({ queryKey: ["staff-menu"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      qc.invalidateQueries({ queryKey: ["stock-alerts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skippe failed");
    } finally {
      setSkippeBusy(false);
    }
  }

  function openPrompt(kind: SkippePromptKind, item: Item) {
    if (kind === "delete") {
      void runSkippeMessage(
        `Delete the menu item named "${item.name}" (id ${item.id}).`,
      );
      return;
    }
    if (kind === "deactivate") {
      void runSkippeMessage(
        `Set menu item "${item.name}" (id ${item.id}) to inactive — hide it from customers.`,
      );
      return;
    }
    if (kind === "edit") {
      setPendingPrompt({
        kind,
        item,
        title: `Edit “${item.name}”`,
        placeholder: "e.g. rename to Blueberry Pancakes, or set description…",
        build: (extra) =>
          `Edit menu item "${item.name}" (id ${item.id}): ${extra}`,
      });
      setPromptExtra("");
      return;
    }
    if (kind === "restock") {
      setPendingPrompt({
        kind,
        item,
        title: `Restock “${item.name}”`,
        placeholder: "e.g. 24",
        build: (extra) =>
          `Set stock of menu item "${item.name}" (id ${item.id}) to ${extra.trim()}.`,
      });
      setPromptExtra("");
      return;
    }
    setPendingPrompt({
      kind,
      item,
      title: `Category for “${item.name}”`,
      placeholder: "type seasonal or non_seasonal",
      build: (extra) =>
        `Set category of menu item "${item.name}" (id ${item.id}) to ${extra.trim()}.`,
    });
    setPromptExtra(item.category === "seasonal" ? "non_seasonal" : "seasonal");
  }

  async function submitPendingPrompt() {
    if (!pendingPrompt) return;
    const extra = promptExtra.trim();
    if (!extra) {
      toast.message("Tell Skippe what to change");
      return;
    }
    const msg = pendingPrompt.build(extra);
    setPendingPrompt(null);
    setPromptExtra("");
    await runSkippeMessage(msg);
  }

  const save = useMutation({
    mutationFn: (v: Partial<Item>) =>
      upsertFn({
        data: {
          id: v.id,
          name: v.name!,
          description: v.description ?? "",
          price_bs: Number(v.price_bs) || 0,
          stock: Number(v.stock) || 0,
          image_url: v.image_url || null,
          category: v.category ?? "non_seasonal",
          is_active: v.is_active ?? true,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-menu"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      qc.invalidateQueries({ queryKey: ["stock-alerts"] });
      toast.success("Saved");
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-menu"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const items = data?.items ?? [];
  const myId = data?.my_user_id ?? "";
  const needsPrice = items.filter(
    (i) => i.price_bs <= 0 && i.owner_id === myId,
  );

  const modeLabel = useMemo(() => {
    const o = MENU_SKIPPE_MODES.find((m) => m.value === skippeMode);
    return o?.label ?? "Gemini";
  }, [skippeMode]);

  return (
    <div className="space-y-6">
      {/* Compact Skippe — animated placeholder + readable shell */}
      <div className="skippe-quick-shell relative overflow-hidden rounded-full border border-cherry/40 px-2 py-1.5 shadow-[0_0_20px_rgba(196,30,90,0.18)]">
        <div className="skippe-quick-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="skippe-quick-shine pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative z-[1] flex items-center gap-2">
          <span className="hidden shrink-0 items-center gap-1 pl-2 sm:inline-flex">
            <Sparkles className="h-3.5 w-3.5 text-cherry skippe-sparkle" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8b1038]">
              Skippe · quick
            </span>
          </span>
          <Select
            value={skippeMode}
            onValueChange={(v) => setSkippeMode(v as SkippeMode)}
          >
            <SelectTrigger className="h-9 w-[10.5rem] shrink-0 rounded-full border-0 bg-white/95 text-xs font-semibold text-ink shadow-sm dark:bg-white/90">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {MENU_SKIPPE_MODES.map((o) => (
                <SelectItem
                  key={o.value}
                  value={o.value}
                  className="rounded-lg text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <GoogleGlyph className="h-3 w-3" />
                    <span>{o.label}</span>
                    <span className="text-ink/40">{o.cost}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-h-9 min-w-0 flex-1 overflow-hidden rounded-full bg-[#1a1a1f] shadow-inner ring-1 ring-white/10">
            <AnimatePresence mode="wait" initial={false}>
              {!skippeInput && (
                <motion.span
                  key={placeholderIdx}
                  initial={{ opacity: 0, x: 28, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -28, filter: "blur(4px)" }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute inset-y-0 left-3 right-3 z-[1] flex items-center truncate text-sm font-medium text-white/55"
                  aria-hidden
                >
                  {activePlaceholder}
                </motion.span>
              )}
            </AnimatePresence>
            <Input
              value={skippeInput}
              onChange={(e) => setSkippeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const t = skippeInput;
                  setSkippeInput("");
                  void runSkippeMessage(t);
                }
              }}
              placeholder=""
              maxLength={2000}
              disabled={skippeBusy}
              className="h-9 w-full border-0 bg-transparent text-sm text-white caret-cherry shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-transparent"
            />
          </div>
          <Button
            type="button"
            disabled={skippeBusy || !skippeInput.trim()}
            onClick={() => {
              const t = skippeInput;
              setSkippeInput("");
              void runSkippeMessage(t);
            }}
            className="h-9 w-9 shrink-0 rounded-full bg-white/90 p-0 text-ink shadow-sm hover:bg-cherry hover:text-cream"
          >
            {skippeBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {skippeLastReply && (
          <p className="relative z-[1] mt-2 line-clamp-3 rounded-xl bg-black/20 px-2.5 py-1.5 text-xs text-ink/80 backdrop-blur-sm dark:text-white/80">
            <span className="font-semibold text-cherry">{modeLabel}: </span>
            {skippeLastReply}
          </p>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">
            Chef menu editor
          </p>
          <h1 className="mt-1 font-display text-4xl">My chef menu</h1>
          <p className="mt-1 text-sm text-ink/60">
            You only see and edit items you own. Other chefs&apos; menus stay
            private.
          </p>
        </div>
        <Button
          onClick={() => setEditing({ ...emptyItem })}
          className="rounded-full bg-ink text-cream hover:bg-cherry"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New item
        </Button>
      </div>

      <StockAlertsPanel />

      {needsPrice.length > 0 && (
        <div className="rounded-3xl border border-cherry/30 bg-cherry/5 p-5">
          <p className="font-display text-xl text-cherry">Needs a price</p>
          <p className="mt-1 text-sm text-ink/60">
            These items are hidden from customers until you set a price above
            zero.
          </p>
          <ul className="mt-4 space-y-2">
            {needsPrice.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3"
              >
                <span className="font-medium">{item.name}</span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const price = Number(fd.get("price")) || 0;
                    save.mutate({
                      ...item,
                      category: item.category as "non_seasonal" | "seasonal",
                      price_bs: price,
                    });
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    name="price"
                    type="number"
                    min={1}
                    placeholder="B$"
                    className="w-28"
                    required
                  />
                  <Button
                    type="submit"
                    disabled={save.isPending}
                    className="rounded-xl bg-ink text-cream hover:bg-cherry"
                  >
                    Set price
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? null : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
          <p className="font-display text-3xl">No items yet</p>
          <p className="mt-2 text-muted-foreground">
            Tap &quot;New item&quot; or ask Skippe above to add your first dish.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="flex gap-4 rounded-3xl border border-border bg-white p-4 transition hover:shadow-md"
            >
              <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-muted">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-3xl">
                    {item.category === "seasonal" ? "🍁" : "🍰"}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.price_bs > 0
                        ? `B$${item.price_bs.toLocaleString()}`
                        : "no price yet"}{" "}
                      · stock {item.stock} ·{" "}
                      {item.is_active ? "active" : "hidden"} ·{" "}
                      {item.category === "seasonal"
                        ? "seasonal"
                        : "non-seasonal"}
                    </p>
                    {item.price_bs <= 0 && (
                      <span className="mt-1 inline-block rounded-full bg-cherry/10 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-cherry">
                        Needs a price
                      </span>
                    )}
                    {isSkippeStocked(item) && (
                      <div className="mt-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={skippeBusy}
                              className="skippe-stocked-badge inline-flex items-center gap-1 rounded-full border border-cherry/25 bg-cherry/5 px-2 py-0.5 text-[0.65rem] font-semibold text-cherry outline-none transition hover:bg-cherry/10 focus-visible:ring-2 focus-visible:ring-cherry/30"
                            >
                              <Sparkles className="h-3 w-3 skippe-sparkle" />
                              <span className="skippe-shimmer-text">
                                Stocked by Skippe
                              </span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className="w-56 rounded-xl"
                          >
                            <DropdownMenuItem
                              className="rounded-lg text-xs"
                              onSelect={() => openPrompt("edit", item)}
                            >
                              Edit this menu item…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg text-xs"
                              onSelect={() => openPrompt("restock", item)}
                            >
                              Restock (set quantity)…
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg text-xs"
                              onSelect={() => openPrompt("seasonal", item)}
                            >
                              Change seasonal / non-seasonal…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="rounded-lg text-xs"
                              onSelect={() => openPrompt("deactivate", item)}
                            >
                              Make inactive (hide from customers)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="rounded-lg text-xs text-destructive focus:text-destructive"
                              onSelect={() => openPrompt("delete", item)}
                            >
                              Delete this menu item
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(item as Partial<Item>)}
                      className="rounded-full p-2 text-ink hover:bg-ink/5"
                      aria-label="Edit item"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${item.name}?`)) {
                          del.mutate(item.id);
                        }
                      }}
                      className="rounded-full p-2 text-destructive hover:bg-destructive/10"
                      aria-label="Delete item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.description || "—"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={!!pendingPrompt}
        onOpenChange={(v) => {
          if (!v) {
            setPendingPrompt(null);
            setPromptExtra("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {pendingPrompt?.title ?? "Tell Skippe"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink/60">
            Skippe will run this on your menu. Add the details it needs below.
          </p>
          <Input
            value={promptExtra}
            onChange={(e) => setPromptExtra(e.target.value)}
            placeholder={pendingPrompt?.placeholder}
            className="mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitPendingPrompt();
              }
            }}
            autoFocus
          />
          <Button
            type="button"
            disabled={skippeBusy || !promptExtra.trim()}
            onClick={() => void submitPendingPrompt()}
            className="mt-3 w-full rounded-full bg-ink py-5 text-cream hover:bg-cherry"
          >
            {skippeBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Send to Skippe
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl">
              {editing?.id ? "Edit item" : "New item"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(editing);
              }}
              className="space-y-4"
            >
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  required
                  maxLength={100}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  maxLength={500}
                  className="mt-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price (B$) · manual only</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.price_bs ?? 0}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        price_bs: Number(e.target.value),
                      })
                    }
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Stock</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.stock ?? 0}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        stock: Number(e.target.value),
                      })
                    }
                    className="mt-2"
                  />
                </div>
              </div>
              <div>
                <Label>Image URL</Label>
                <Input
                  value={editing.image_url ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, image_url: e.target.value })
                  }
                  placeholder="https://..."
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  value={editing.category ?? "non_seasonal"}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: e.target.value as "non_seasonal" | "seasonal",
                    })
                  }
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
                >
                  <option value="non_seasonal">Non-seasonal</option>
                  <option value="seasonal">Seasonal</option>
                </select>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-secondary p-3">
                <Label>Active (visible to customers)</Label>
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) =>
                    setEditing({ ...editing, is_active: v })
                  }
                />
              </div>
              <Button
                disabled={save.isPending}
                type="submit"
                className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry"
              >
                {save.isPending ? "Saving..." : "Save item"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes skippe-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes skippe-sparkle-spin {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 1; }
          50% { transform: rotate(18deg) scale(1.2); opacity: 0.8; }
        }
        @keyframes skippe-shell-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes skippe-shine-sweep {
          0% { transform: translateX(-120%) skewX(-12deg); opacity: 0; }
          30% { opacity: 0.55; }
          60% { opacity: 0.35; }
          100% { transform: translateX(120%) skewX(-12deg); opacity: 0; }
        }
        @keyframes skippe-pulse-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(196, 30, 90, 0.35), 0 0 24px rgba(196, 30, 90, 0.12); }
          50% { box-shadow: 0 0 0 6px rgba(196, 30, 90, 0), 0 0 32px rgba(232, 93, 138, 0.28); }
        }
        .skippe-quick-shell {
          background: linear-gradient(
            120deg,
            #ffd6e6 0%,
            #ffc2d8 25%,
            #ffe8f0 50%,
            #ffb8d0 75%,
            #ffdceb 100%
          );
          background-size: 300% 300%;
          animation: skippe-shell-flow 6s ease-in-out infinite, skippe-pulse-ring 3.2s ease-in-out infinite;
        }
        .skippe-quick-glow {
          background: radial-gradient(
            ellipse 80% 120% at 20% 50%,
            rgba(255, 255, 255, 0.28) 0%,
            transparent 55%
          ),
          radial-gradient(
            ellipse 70% 100% at 85% 50%,
            rgba(196, 30, 90, 0.12) 0%,
            transparent 50%
          );
          animation: skippe-shell-flow 8s ease-in-out infinite reverse;
        }
        .skippe-quick-shine {
          width: 40%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.28),
            transparent
          );
          animation: skippe-shine-sweep 4.2s ease-in-out infinite;
        }
        .skippe-shimmer-text {
          background: linear-gradient(
            90deg,
            #c41e5a 0%,
            #ff8ab0 30%,
            #c41e5a 50%,
            #ff8ab0 70%,
            #c41e5a 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: skippe-shimmer 2.2s linear infinite;
        }
        .skippe-sparkle {
          animation: skippe-sparkle-spin 1.8s ease-in-out infinite;
        }
        .skippe-stocked-badge:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
