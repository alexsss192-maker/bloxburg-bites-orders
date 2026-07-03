import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Panda Bites" },
      { name: "description", content: "Panda Bites staff sign-in for admins and chefs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffLogin,
});

function StaffLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/staff/orders" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast.success("Signed in");
      navigate({ to: "/staff/orders" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <SiteHeader />
      <main className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-6 py-16">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={onSubmit}
          className="w-full space-y-4 rounded-3xl border border-border/60 bg-white p-8 shadow-xl"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cherry">Staff portal</p>
            <h1 className="mt-2 font-display text-4xl">Welcome back, chef.</h1>
            <p className="mt-1 text-sm text-muted-foreground">Only Panda Bites staff can access this area.</p>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="mt-2 h-12 rounded-xl" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="mt-2 h-12 rounded-xl" />
          </div>
          <Button disabled={loading} type="submit" className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Admins: your account is <span className="font-mono">Hellosavagesavage79@pandabites.local</span> — password set at setup.
          </p>
        </motion.form>
      </main>
    </div>
  );
}