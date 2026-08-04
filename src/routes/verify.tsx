import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { redirectVerifiedHome } from "@/lib/verified-guard";
import pandaMascot from "@/assets/panda-mascot.png";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify with Discord — Panda Bites" },
      { name: "description", content: "Verify your Discord account to enter Panda Bites." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => redirectVerifiedHome(),
  component: VerifyPage,
});

type Step = "username" | "code";

function VerifyPage() {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (username.trim().length < 2) return;
    setLoading(true);
    setNeedsJoin(false);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/public/verify/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        discord_id?: string;
        username?: string;
        avatar_url?: string | null;
        needs_join?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.needs_join) setNeedsJoin(true);
        throw new Error(data.error ?? "Failed");
      }
      setDiscordId(data.discord_id!);
      setResolvedName(data.username!);
      setAvatar(data.avatar_url ?? null);
      setStep("code");
      setCooldown(60);
      toast.success("Code sent — check your Discord DMs");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (cooldown > 0 || resending || !discordId) return;
    setResending(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/public/verify/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discord_id: discordId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; cooldown?: number; retry_after?: number };
      if (!res.ok || !data.ok) {
        if (data.retry_after) setCooldown(data.retry_after);
        throw new Error(data.error ?? "Failed");
      }
      setCode("");
      setCooldown(data.cooldown ?? 60);
      toast.success("New code sent to your DMs");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resend failed";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setResending(false);
    }
  }

  async function confirmCode(finalCode?: string) {
    const c = (finalCode ?? code).trim();
    if (c.length !== 6) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/public/verify/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discord_id: discordId, code: c, username: resolvedName, avatar_url: avatar }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; expired?: boolean; attempts_left?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      toast.success("Verified! Welcome to Panda Bites 🐼");
      window.location.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setErrorMsg(msg);
      toast.error(msg);
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blossom via-cream to-petal">
      <BlossomBackdrop />
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid w-full max-w-4xl overflow-hidden rounded-[2.5rem] border border-ink/10 bg-blossom/70 shadow-[0_40px_100px_-30px_rgba(196,92,124,0.35)] backdrop-blur-xl md:grid-cols-[1fr_1.2fr]"
        >
          <aside className="relative hidden flex-col justify-between bg-gradient-to-br from-cherry to-ink p-10 text-cream md:flex">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.4em] text-cream/70">Members only</p>
              <h1 className="mt-3 font-display text-5xl leading-none">
                Come inside,<br />
                <span className="italic">friend.</span>
              </h1>
              <p className="mt-4 max-w-xs text-sm text-cream/75">
                Panda Bites is invite-only. Verify with Discord to see the menu, order, and follow your bag from the
                chef's oven to your Bloxburg door.
              </p>
            </div>
            <motion.img
              src={pandaMascot}
              alt=""
              width={180}
              height={180}
              className="mx-auto drop-shadow-[0_20px_25px_rgba(0,0,0,0.35)]"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </aside>

          <main className="p-8 md:p-12">
            <div className="mb-8 flex items-center gap-2 text-cherry">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs uppercase tracking-[0.35em]">Discord verification</span>
            </div>

            <AnimatePresence mode="wait">
              {step === "username" ? (
                <motion.form
                  key="username"
                  onSubmit={requestCode}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  className="space-y-5"
                >
                  <h2 className="font-display text-4xl">What's your Discord?</h2>
                  <p className="text-sm text-ink/60">
                    Enter your Discord username (or user ID). Our bot will DM you a 6-digit code.
                  </p>
                  <div>
                    <Label htmlFor="dc">Discord username</Label>
                    <Input
                      id="dc"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. hellosavage"
                      autoFocus
                      maxLength={64}
                      className="mt-2 h-12 rounded-2xl border-ink/10 bg-blossom text-lg"
                    />
                  </div>
                  {needsJoin && (
                    <a
                      href="https://discord.gg/lovable-dev"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-2xl border border-cherry/30 bg-cherry/10 p-4 text-sm text-ink hover:bg-cherry/20"
                    >
                      <span className="font-medium">Join the Panda Bites Discord first</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    disabled={loading || username.trim().length < 2}
                    type="submit"
                    className="group w-full rounded-full bg-ink py-6 text-base text-cream hover:bg-cherry"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Send my code <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" /></>}
                  </Button>
                  <p className="text-[0.7rem] uppercase tracking-[0.3em] text-ink/40">
                    Enable DMs from server members in Discord's privacy settings.
                  </p>
                </motion.form>
              ) : (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="space-y-5"
                >
                  <div className="flex items-center gap-3">
                    {avatar && <img src={avatar} alt="" className="h-12 w-12 rounded-full ring-2 ring-cherry/40" />}
                    <div>
                      <h2 className="font-display text-3xl leading-tight">Enter the code</h2>
                      <p className="text-xs text-ink/60">DM'd to @{resolvedName} · valid for 5 minutes</p>
                    </div>
                  </div>
                  <div className="flex justify-center py-2">
                    <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v); if (v.length === 6) confirmCode(v); }}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} className="h-14 w-12 rounded-xl border-ink/15 bg-blossom text-2xl" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {errorMsg && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
                    >
                      {errorMsg}
                    </motion.p>
                  )}
                  <Button
                    disabled={loading || code.length !== 6}
                    onClick={() => confirmCode()}
                    className="w-full rounded-full bg-ink py-6 text-cream hover:bg-cherry"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enter Panda Bites"}
                  </Button>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => { setStep("username"); setCode(""); setErrorMsg(null); }}
                      className="text-xs uppercase tracking-[0.3em] text-cherry hover:text-ink"
                    >
                      ← Wrong account?
                    </button>
                    <button
                      type="button"
                      onClick={resendCode}
                      disabled={cooldown > 0 || resending}
                      className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.3em] text-cherry hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </motion.div>
      </div>
    </div>
  );
}

function BlossomBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-3 w-3 rounded-full bg-sakura/70"
          style={{ left: `${(i * 83) % 100}%`, top: `${(i * 41) % 100}%` }}
          animate={{ y: [0, 20, 0], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 5 + (i % 5), repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
        />
      ))}
    </div>
  );
}