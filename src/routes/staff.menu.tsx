import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { listAllMenu, upsertMenuItem, deleteMenuItem, getMyRoles } from "@/lib/menu.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/staff/menu")({
  head: () => ({
    meta: [
      { title: "My Chef Menu — Panda Bites" },
      { name: "description", content: "Manage your private Panda Bites chef menu." },
      { property: "og:title", content: "My Chef Menu — Panda Bites" },
      { property: "og:description", content: "Manage a Panda Bites chef menu." },
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

function MenuEditor() {
  const listFn = useServerFn(listAllMenu);
  const upsertFn = useServerFn(upsertMenuItem);
  const delFn = useServerFn(deleteMenuItem);
  const rolesFn = useServerFn(getMyRoles);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["staff-menu"], queryFn: () => listFn() });
  const { data: roles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const [editing, setEditing] = useState<Partial<Item> | null>(null);

  const save = useMutation({
    mutationFn: (v: Partial<Item>) => upsertFn({ data: {
      id: v.id,
      name: v.name!,
      description: v.description ?? "",
      price_bs: Number(v.price_bs) || 0,
      stock: Number(v.stock) || 0,
      image_url: v.image_url || null,
      category: v.category ?? "non_seasonal",
      is_active: v.is_active ?? true,
    }}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-menu"] });
      qc.invalidateQueries({ queryKey: ["public-menu"] });
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

  const isAdmin = roles?.isAdmin ?? false;
  const items = data ?? [];
  const needsPrice = items.filter((i) => i.price_bs <= 0);

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">
            {isAdmin ? "Admin menu editor" : "Chef menu editor"}
          </p>
          <h1 className="mt-1 font-display text-4xl">
            My chef items
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {isAdmin
              ? "Admins see all items. Chefs only see and edit items they own."
              : "You only see and edit items you own. Anything you create belongs to your chef menu."}
          </p>
        </div>
        <Button
          onClick={() => setEditing({ ...emptyItem })}
          className="rounded-full bg-ink text-cream hover:bg-cherry"
        >
          <Plus className="mr-1 h-4 w-4" /> New item
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : null}

      {!isLoading && needsPrice.length > 0 && (
        <div className="rounded-3xl border border-cherry/30 bg-petal p-5">
          <p className="font-display text-xl">
            {needsPrice.length} item{needsPrice.length === 1 ? "" : "s"} need a price
          </p>
          <p className="mt-1 text-sm text-ink/60">
            These are live on the menu, but customers can't buy them until you set a price. Type it here and hit enter.
          </p>
          <ul className="mt-4 space-y-2">
            {needsPrice.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3">
                <span className="flex-1 font-semibold">{item.name}</span>
                <span className="rounded-full bg-cherry/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-cherry">
                  Needs a price
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = Number(new FormData(e.currentTarget).get("price"));
                    if (!Number.isFinite(value) || value <= 0) {
                      toast.error("Enter a price above B$0");
                      return;
                    }
                    save.mutate({ ...(item as Partial<Item>), price_bs: Math.floor(value) });
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    name="price"
                    type="number"
                    min={1}
                    placeholder="B$"
                    className="h-10 w-28 rounded-xl"
                    aria-label={`Price for ${item.name}`}
                  />
                  <Button type="submit" disabled={save.isPending} className="h-10 rounded-xl bg-ink text-cream hover:bg-cherry">
                    Set price
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? null
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-ink/20 bg-white p-16 text-center">
          <p className="font-display text-3xl">No items yet</p>
          <p className="mt-2 text-muted-foreground">Tap "New item" to add your first dish.</p>
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
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-3xl">{item.category === "seasonal" ? "🍁" : "🍰"}</div>
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      B${item.price_bs.toLocaleString()} · stock {item.stock} · {item.is_active ? "active" : "hidden"} · {item.category === "seasonal" ? "seasonal" : "non-seasonal"}
                    </p>
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
                      onClick={() => { if (confirm(`Delete ${item.name}?`)) del.mutate(item.id); }}
                      className="rounded-full p-2 text-destructive hover:bg-destructive/10"
                      aria-label="Delete item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description || "—"}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl">{editing?.id ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }} className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required maxLength={100} className="mt-2" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={500} className="mt-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price (B$) · manual only</Label>
                  <Input type="number" min={0} value={editing.price_bs ?? 0} onChange={(e) => setEditing({ ...editing, price_bs: Number(e.target.value) })} className="mt-2" />
                </div>
                <div>
                  <Label>Stock</Label>
                  <Input type="number" min={0} value={editing.stock ?? 0} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} className="mt-2" />
                </div>
              </div>
              <div>
                <Label>Image URL</Label>
                <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="https://..." className="mt-2" />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  value={editing.category ?? "non_seasonal"}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value as "non_seasonal" | "seasonal" })}
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
                >
                  <option value="non_seasonal">Non-seasonal</option>
                  <option value="seasonal">Seasonal</option>
                </select>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-secondary p-3">
                <Label>Active (visible to customers)</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
              <Button disabled={save.isPending} type="submit" className="w-full rounded-full bg-ink text-cream hover:bg-cherry py-6">
                {save.isPending ? "Saving..." : "Save item"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
