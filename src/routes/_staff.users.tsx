import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listStaffUsers, setUserRole, createStaffUser } from "@/lib/menu.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_staff/users")({
  head: () => ({ meta: [{ title: "Staff users — Panda Bites" }, { name: "robots", content: "noindex" }] }),
  component: UsersPage,
});

function UsersPage() {
  const listFn = useServerFn(listStaffUsers);
  const roleFn = useServerFn(setUserRole);
  const createFn = useServerFn(createStaffUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["staff-users"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", role: "chef" as "admin" | "chef" });

  const toggle = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "chef"; enabled: boolean }) => roleFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-users"] }); toast.success("Role updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const create = useMutation({
    mutationFn: (v: typeof form) => createFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff-users"] }); toast.success("Staff user created"); setOpen(false); setForm({ email: "", password: "", role: "chef" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">Access</p>
          <h1 className="mt-1 font-display text-4xl">Staff & roles</h1>
        </div>
        <Button onClick={() => setOpen(true)} className="rounded-full bg-ink text-cream hover:bg-cherry">+ New staff</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading...</p> : (
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="p-3">Email</th>
                <th className="p-3">Admin</th>
                <th className="p-3">Chef</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-border/60">
                  <td className="p-3 font-medium">{u.email || u.id}</td>
                  <td className="p-3">
                    <input type="checkbox" checked={u.roles.includes("admin")}
                      onChange={(e) => toggle.mutate({ user_id: u.id, role: "admin", enabled: e.target.checked })} />
                  </td>
                  <td className="p-3">
                    <input type="checkbox" checked={u.roles.includes("chef")}
                      onChange={(e) => toggle.mutate({ user_id: u.id, role: "chef", enabled: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle className="font-display text-2xl">New staff account</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="mt-2" />
            </div>
            <div>
              <Label>Password (min 6 chars)</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className="mt-2" />
            </div>
            <div>
              <Label>Role</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "chef" })}
                className="mt-2 w-full rounded-md border border-input bg-background p-2">
                <option value="chef">Chef</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button disabled={create.isPending} type="submit" className="w-full rounded-full bg-ink text-cream hover:bg-cherry py-6">
              {create.isPending ? "Creating..." : "Create staff user"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}