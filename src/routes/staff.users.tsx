import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { listStaffUsers, setUserRole, createStaffUser, resetStaffPassword } from "@/lib/menu.functions";
import { normalizeStaffUsername } from "@/lib/staff-username";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/staff/users")({
  head: () => ({
    meta: [
      { title: "Staff & Roles — Panda Bites Admin" },
      { name: "description", content: "Create Panda Bites staff accounts and manage chef and admin roles." },
      { property: "og:title", content: "Staff & Roles — Panda Bites Admin" },
      { property: "og:description", content: "Manage Panda Bites staff accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const listFn = useServerFn(listStaffUsers);
  const roleFn = useServerFn(setUserRole);
  const createFn = useServerFn(createStaffUser);
  const resetFn = useServerFn(resetStaffPassword);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["staff-users"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "chef" as "admin" | "chef" });
  const [resetting, setResetting] = useState<{ id: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const toggle = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "chef"; enabled: boolean }) => roleFn({ data: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      toast.success(v.enabled ? `${v.role} access granted` : `${v.role} access removed`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the role"),
  });

  const create = useMutation({
    mutationFn: (v: typeof form) => createFn({ data: v }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      toast.success(`${result.username} can sign in now with the username "${result.sign_in_username}"`);
      setOpen(false);
      setForm({ username: "", password: "", role: "chef" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the account"),
  });

  const reset = useMutation({
    mutationFn: (v: { user_id: string; password: string }) => resetFn({ data: v }),
    onSuccess: () => {
      toast.success("Password changed — share it with them directly");
      setResetting(null);
      setNewPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change the password"),
  });

  const users = data ?? [];
  const signInPreview = normalizeStaffUsername(form.username);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cherry">Access</p>
          <h1 className="mt-1 font-display text-4xl">Staff &amp; roles</h1>
          <p className="mt-1 max-w-xl text-sm text-ink/60">
            Accounts sign in with a <b>username and password</b> — no email needed. Create one here and the chef can
            sign in immediately with exactly what you type.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="rounded-full bg-ink text-cream hover:bg-cherry">
          <UserPlus className="mr-1.5 h-4 w-4" /> New staff
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <article
              key={u.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
            >
              <div className="min-w-[10rem] flex-1">
                <p className="font-display text-2xl leading-tight">{u.username}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {u.roles.length === 0 && (
                    <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-ink/50">
                      No access
                    </span>
                  )}
                  {u.roles.includes("admin") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-cream">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {u.roles.includes("chef") && (
                    <span className="rounded-full bg-cherry/10 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-cherry">
                      Chef
                    </span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={u.roles.includes("chef")}
                  onCheckedChange={(enabled) => toggle.mutate({ user_id: u.id, role: "chef", enabled })}
                />
                Chef
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={u.roles.includes("admin")}
                  onCheckedChange={(enabled) => toggle.mutate({ user_id: u.id, role: "admin", enabled })}
                />
                Admin
              </label>
              <Button
                variant="ghost"
                onClick={() => {
                  setResetting({ id: u.id, username: u.username });
                  setNewPassword("");
                }}
                className="rounded-full text-ink hover:bg-petal"
              >
                <KeyRound className="mr-1.5 h-4 w-4" /> Password
              </Button>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">New staff account</DialogTitle>
            <DialogDescription>
              They sign in at the staff page with this username and password.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(form);
            }}
            className="space-y-4"
          >
            <div>
              <Label>Username</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                minLength={2}
                maxLength={48}
                autoComplete="off"
                placeholder="e.g. Alex"
                className="mt-2"
              />
              {form.username.trim().length > 0 && (
                <p className="mt-1.5 text-xs text-ink/55">
                  They'll sign in as <b>{signInPreview || "—"}</b> (capitals and spaces don't matter).
                </p>
              )}
            </div>
            <div>
              <Label>Password (min 6 characters)</Label>
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
                autoComplete="new-password"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Role</Label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "chef" })}
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
              >
                <option value="chef">Chef</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button
              disabled={create.isPending}
              type="submit"
              className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry"
            >
              {create.isPending ? "Creating…" : "Create staff account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetting !== null} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Set a new password</DialogTitle>
            <DialogDescription>
              For <b>{resetting?.username}</b>. Share it with them directly — there is no reset email.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!resetting) return;
              reset.mutate({ user_id: resetting.id, password: newPassword });
            }}
            className="space-y-4"
          >
            <div>
              <Label>New password (min 6 characters)</Label>
              <Input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="mt-2"
              />
            </div>
            <Button
              disabled={reset.isPending}
              type="submit"
              className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry"
            >
              {reset.isPending ? "Saving…" : "Change password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
