import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BadgePercent, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDiscount, listDiscounts, upsertDiscount } from "@/lib/menu.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/staff/discounts")({
  head: () => ({ meta: [
    { title: "Chef Discounts — Panda Bites Staff" },
    { name: "description", content: "Manage chef-owned Panda Bites discounts." },
    { property: "og:title", content: "Chef Discounts — Panda Bites Staff" },
    { property: "og:description", content: "Manage chef-owned menu discounts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: DiscountsPage,
});

type Discount = { id?: string; name: string; code: string | null; discount_type: "percentage" | "fixed"; value: number; is_automatic: boolean; is_active: boolean; starts_at: string | null; ends_at: string | null };
const emptyDiscount: Discount = { name: "", code: null, discount_type: "percentage", value: 10, is_automatic: true, is_active: true, starts_at: null, ends_at: null };

function DiscountsPage() {
  const listFn = useServerFn(listDiscounts);
  const saveFn = useServerFn(upsertDiscount);
  const deleteFn = useServerFn(deleteDiscount);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Discount | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ["staff-discounts"], queryFn: () => listFn() });
  const save = useMutation({ mutationFn: (value: Discount) => saveFn({ data: value }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-discounts"] }); setEditing(null); toast.success("Discount saved"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save") });
  const remove = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-discounts"] }); toast.success("Discount removed"); } });

  return <div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[0.3em] text-cherry">Your chef menu only</p><h1 className="mt-1 font-display text-4xl">Discounts</h1><p className="mt-1 text-sm text-ink/60">Offers apply only to items you own, even inside a mixed-chef basket.</p></div>
      <Button onClick={() => setEditing({ ...emptyDiscount })} className="rounded-full bg-ink text-cream hover:bg-cherry"><Plus className="mr-1 h-4 w-4" /> New discount</Button>
    </div>
    {isLoading ? <p>Loading…</p> : data.length === 0 ? <div className="rounded-2xl border border-dashed border-ink/20 bg-card p-10 text-center"><BadgePercent className="mx-auto h-8 w-8 text-cherry" /><p className="mt-3 font-display text-2xl">No discounts yet</p></div> : <div className="grid gap-4 md:grid-cols-2">{data.map((discount) => <article key={discount.id} className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-display text-2xl">{discount.name}</p><p className="text-sm text-cherry">{discount.discount_type === "percentage" ? `${discount.value}% off` : `B$${discount.value.toLocaleString()} off`} · {discount.is_automatic ? "Automatic" : discount.code}</p></div><div className="flex"><Button variant="ghost" size="icon" onClick={() => setEditing(discount)} aria-label="Edit discount"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => discount.id && remove.mutate(discount.id)} aria-label="Delete discount"><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div><p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink/50">{discount.is_active ? "Active" : "Inactive"}</p></article>)}</div>}
    <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{editing?.id ? "Edit discount" : "New discount"}</DialogTitle></DialogHeader>{editing && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}><div><Label>Name</Label><Input required maxLength={100} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Type</Label><select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3" value={editing.discount_type} onChange={(e) => setEditing({ ...editing, discount_type: e.target.value as Discount["discount_type"] })}><option value="percentage">Percentage</option><option value="fixed">Fixed B$</option></select></div><div><Label>Value</Label><Input type="number" min={1} max={editing.discount_type === "percentage" ? 100 : 100000000} value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} /></div></div><div className="flex items-center justify-between rounded-xl bg-secondary p-3"><Label>Apply automatically</Label><Switch checked={editing.is_automatic} onCheckedChange={(value) => setEditing({ ...editing, is_automatic: value, code: value ? null : editing.code })} /></div>{!editing.is_automatic && <div><Label>Promo code</Label><Input required minLength={2} maxLength={32} value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></div>}<div className="flex items-center justify-between rounded-xl bg-secondary p-3"><Label>Active</Label><Switch checked={editing.is_active} onCheckedChange={(value) => setEditing({ ...editing, is_active: value })} /></div><Button type="submit" disabled={save.isPending} className="w-full bg-ink text-cream hover:bg-cherry">{save.isPending ? "Saving…" : "Save discount"}</Button></form>}</DialogContent></Dialog>
  </div>;
}