import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  getMemberProfile,
  type MemberProfile,
} from "@/lib/members.functions";
import { listOrdersForUsername } from "@/lib/orders.functions";
import { SiteHeader } from "@/components/site-header";
import { rewardIcon } from "@/components/reward-popup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Copy,
  Crown,
  Zap,
  Clock3,
  Gift,
  Wallet,
  ShoppingBag,
  ChevronRight,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: "My Panda profile — Panda Bites" },
      {
        name: "description",
        content:
          "Your Panda Bites member profile: Panda Rewards progress, perks, B$ summary and order history.",
      },
      { property: "og:title", content: "My Panda profile — Panda Bites" },
      {
        property: "og:description",
        content: "Track your Panda Rewards, perks and orders at Panda Bites.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MemberPage,
});

const MILESTONES: Array<{
  step: number;
  title: string;
  perks: string[];
}> = [
  {
    step: 1,
    title: "First bite",
    perks: ["20% off your next order ×1"],
  },
  {
    step: 2,
    title: "Regular",
    perks: ["Auto Low Priority", "Fooder role", "Pickup within 3 days"],
  },
  {
    step: 3,
    title: "Snack star",
    perks: ["30% off ×1", "2 giveaway entries"],
  },
  {
    step: 4,
    title: "Panda pal",
    perks: [
      "20% off ×1",
      "Pickup within 7 days",
      "1 expired discount claim",
      "10,000 B$",
    ],
  },
  {
    step: 5,
    title: "King of Fooders",
    perks: [
      "20% off ×3",
      "No pickup time limit",
      "Auto Mid Priority",
      "2 expired discount claims",
      "King of Fooders + Custom Role",
    ],
  },
];

function MemberPage() {
  const profileFn = useServerFn(getMemberProfile);
  const ordersFn = useServerFn(listOrdersForUsername);

  const [input, setInput] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("pb_discord_username");

      if (saved) {
        setInput(saved);
        setUsername(saved);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const normalizedUsername = username.trim().replace(/^@+/, "");
  const enabled = normalizedUsername.length >= 2;

  const {
    data: profile,
    isLoading,
    isError: profileError,
    error: profileQueryError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["member-profile", normalizedUsername],
    queryFn: () =>
      profileFn({
        data: {
          username: normalizedUsername,
        },
      }),
    enabled,
    retry: false,
    // No auto-poll — loads once per visit. `refetchProfile` is already
    // wired to the "Try again" button below; consider adding a normal
    // "Refresh" button too since that's currently only shown on errors.
  });

  const { data: orders } = useQuery({
    queryKey: ["member-orders", normalizedUsername],
    queryFn: () =>
      ordersFn({
        data: {
          username: normalizedUsername,
        },
      }),
    enabled,
  });

  async function lookup(e: React.FormEvent) {
    e.preventDefault();

    const next = input.trim().replace(/^@+/, "");

    if (next.length < 2) {
      toast.error("Enter your Discord username first.");
      return;
    }

    setInput(next);
    setUsername(next);

    try {
      window.localStorage.setItem("pb_discord_username", next);
    } catch {
      /* storage unavailable */
    }

    // If this is already the active username, force a fresh lookup.
    if (next === normalizedUsername) {
      await refetchProfile();
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-cream">
      <SiteHeader />

      <main className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Lightweight decorative background */}
        <div className="pointer-events-none absolute left-0 top-20 text-4xl opacity-20">
          🌸
        </div>

        <div className="pointer-events-none absolute right-2 top-40 text-2xl opacity-20">
          ✦
        </div>

        <div className="pointer-events-none absolute bottom-80 left-2 text-xl opacity-15">
          🌸
        </div>

        {/* Page heading */}
        <div className="relative">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🐼</span>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-cherry">
                  Panda members
                </p>
              </div>

              <h1 className="mt-2 font-display text-4xl tracking-tight sm:text-5xl">
                My Panda{" "}
                <span className="italic text-cherry">profile</span>
              </h1>

              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Your rewards, perks, B$ and Panda Bites order history — all in
                one place.
              </p>
            </div>

            <div className="hidden text-4xl sm:block">🎋</div>
          </div>
        </div>

        {/* Username lookup */}
        <form
          onSubmit={lookup}
          className="relative mt-7 overflow-hidden rounded-[1.75rem] border border-cherry/10 bg-card p-3 shadow-sm"
        >
          <div className="pointer-events-none absolute -right-2 -top-4 text-3xl opacity-20">
            🌸
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={64}
              placeholder="Your Discord username from checkout"
              className="h-12 flex-1 rounded-2xl border-border bg-background px-4"
            />

            <Button
              type="submit"
              className="pb-press h-12 rounded-2xl bg-ink px-6 font-bold text-cream hover:bg-cherry"
            >
              <Search className="mr-2 h-4 w-4" />
              Open my profile
            </Button>
          </div>
        </form>

        {!enabled ? (
          <EmptyState
            icon="🐼"
            title="Your Panda profile is waiting"
            description="Enter the Discord username you use when ordering to open your rewards dashboard."
          />
        ) : isLoading ? (
          <div className="mt-10 rounded-[2rem] border border-border bg-card p-10 text-center">
            <div className="text-4xl">🐼</div>
            <p className="mt-3 font-display text-xl">
              Loading your bamboo…
            </p>
          </div>
        ) : profileError ? (
          <div className="relative mt-10 overflow-hidden rounded-[2.25rem] border border-cherry/15 bg-card p-10 text-center shadow-sm sm:p-16">
            <div className="pointer-events-none absolute left-5 top-4 text-xl opacity-30">
              ✦
            </div>

            <div className="pointer-events-none absolute right-6 top-6 text-2xl opacity-25">
              🌸
            </div>

            <div className="text-5xl">🐼</div>

            <p className="mt-4 font-display text-2xl">
              We couldn't open your Panda profile
            </p>

            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              The profile lookup ran into a problem. Your username is still
              saved, so you can try again without entering it again.
            </p>

            {profileQueryError instanceof Error && (
              <p className="mx-auto mt-4 max-w-lg rounded-xl bg-petal px-4 py-2 text-xs text-cherry">
                {profileQueryError.message}
              </p>
            )}

            <button
              type="button"
              onClick={() => refetchProfile()}
              className="mt-6 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry"
            >
              Try again
            </button>
          </div>
        ) : !profile ? (
          <div className="relative mt-10 overflow-hidden rounded-[2.25rem] border border-dashed border-border bg-card p-10 text-center sm:p-16">
            <div className="pointer-events-none absolute left-5 top-4 text-xl opacity-30">
              ✦
            </div>

            <div className="pointer-events-none absolute right-6 top-6 text-2xl opacity-25">
              🌸
            </div>

            <div className="text-5xl">🐼</div>

            <p className="mt-4 font-display text-2xl">
              {(orders?.length ?? 0) > 0
                ? "Profile is catching up"
                : "No Panda member yet"}
            </p>

            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {(orders?.length ?? 0) > 0 ? (
                <>
                  We found {orders!.length} order
                  {orders!.length === 1 ? "" : "s"} for @{normalizedUsername},
                  but the rewards profile hasn&apos;t been linked yet. Open{" "}
                  <Link to="/history" className="font-semibold text-cherry underline-offset-2 hover:underline">
                    Orders
                  </Link>{" "}
                  anytime, or try again after the kitchen finishes linking your
                  account.
                </>
              ) : (
                <>
                  We couldn&apos;t find a member profile for @{normalizedUsername}.
                  Place your first order and your Panda Rewards journey starts
                  right away.
                </>
              )}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {(orders?.length ?? 0) > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => refetchProfile()}
                    className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry"
                  >
                    Try linking again
                  </button>
                  <Link
                    to="/history"
                    className="inline-flex rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-ink transition hover:bg-petal"
                  >
                    View orders
                  </Link>
                </>
              ) : (
                <Link
                  to="/menu"
                  className="inline-flex rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition hover:bg-cherry"
                >
                  Browse menu
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="relative mt-8 space-y-6">
            <MemberHero profile={profile} />

            <QuickStats profile={profile} />

            <ProgressTrack profile={profile} />

            <div className="grid gap-6 lg:grid-cols-2">
              <RewardWallet profile={profile} />

              <div className="space-y-6">
                <PerksCard profile={profile} />
                <BsCard profile={profile} />
              </div>
            </div>

            <ExpiredClaims username={username} />

            <OrderHistory orders={orders ?? []} />
          </div>
        )}
      </main>
    </div>
  );
}

/* =========================================================
   SHARED CARD
========================================================= */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/* =========================================================
   MEMBER HERO
========================================================= */

function MemberHero({ profile }: { profile: MemberProfile }) {
  return (
    <section className="relative overflow-hidden rounded-[2.25rem] border border-cherry/15 bg-gradient-to-br from-petal via-card to-card p-6 shadow-sm sm:p-8">
      {/* Decorative lights */}
      <div className="pointer-events-none absolute right-7 top-5 flex gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-cherry/50" />
        <span className="mt-2 h-1 w-1 rounded-full bg-cherry/30" />
        <span className="h-1.5 w-1.5 rounded-full bg-cherry/40" />
      </div>

      <div className="pointer-events-none absolute -bottom-8 -right-5 text-7xl opacity-10">
        🐼
      </div>

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <div className="grid h-24 w-24 place-items-center rounded-[2rem] bg-ink text-5xl shadow-lg">
            🐼
          </div>

          <span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border-4 border-card bg-cherry text-sm text-cream">
            ✓
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-cherry">
              Panda member
            </p>

            {profile.delivered_count >= 5 && (
              <span className="rounded-full bg-cherry/10 px-2.5 py-1 text-[10px] font-bold text-cherry">
                🏆 Rewards complete
              </span>
            )}
          </div>

          <h2 className="mt-1 truncate font-display text-3xl sm:text-4xl">
            @{profile.username}
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {profile.delivered_count} completed order
            {profile.delivered_count === 1 ? "" : "s"} ·{" "}
            {profile.giveaway_entries} giveaway entr
            {profile.giveaway_entries === 1 ? "y" : "ies"}
          </p>

          {profile.roles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-cherry px-3 py-1.5 text-xs font-bold text-cream shadow-sm"
                >
                  👑 {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   QUICK STATS
========================================================= */

function QuickStats({ profile }: { profile: MemberProfile }) {
  const done = Math.min(profile.delivered_count, 5);

  const stats = [
    {
      icon: "🐼",
      label: "Reward stage",
      value: `${done}/5`,
    },
    {
      icon: "⚡",
      label: "Priority",
      value: profile.priority_tier
        ? profile.priority_tier === "mid"
          ? "Mid"
          : profile.priority_tier === "high"
            ? "High"
            : "Low"
        : "Standard",
    },
    {
      icon: "🎉",
      label: "Giveaways",
      value: profile.giveaway_entries.toString(),
    },
    {
      icon: "💰",
      label: "B$ owed",
      value: `B$${profile.bs_owed.toLocaleString()}`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="relative overflow-hidden rounded-[1.5rem] border border-border bg-card p-4 shadow-sm"
        >
          <span className="text-xl">{stat.icon}</span>

          <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-ink/45">
            {stat.label}
          </p>

          <p className="mt-0.5 font-display text-xl">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   REWARDS
========================================================= */

function ProgressTrack({ profile }: { profile: MemberProfile }) {
  const done = Math.min(profile.delivered_count, 5);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎁</span>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cherry">
              Order for a reward™
            </p>
          </div>

          <h3 className="mt-1 font-display text-2xl">
            Panda Rewards
          </h3>
        </div>

        <span className="rounded-full bg-petal px-3 py-1.5 text-xs font-bold text-cherry">
          {done}/5 unlocked
        </span>
      </div>

      {/* Progress */}
      <div className="relative mt-6">
        <div className="h-3 overflow-hidden rounded-full bg-ink/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-bamboo to-cherry"
            initial={{ width: 0 }}
            animate={{ width: `${(done / 5) * 100}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>

        <div className="absolute -top-1.5 left-0 right-0 flex justify-between">
          {MILESTONES.map((m) => {
            const unlocked = done >= m.step;

            return (
              <div
                key={m.step}
                className={`grid h-6 w-6 place-items-center rounded-full border-2 ${
                  unlocked
                    ? "border-cherry bg-cherry text-cream"
                    : "border-card bg-ink/10 text-ink/40"
                } text-[9px] font-bold`}
              >
                                {unlocked ? <Check className="h-3 w-3" /> : m.step}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {MILESTONES.map((m) => {
          const unlocked = done >= m.step;
          const current = done + 1 === m.step;

          return (
            <li
              key={m.step}
              className={`relative overflow-hidden rounded-2xl border p-4 transition ${
                unlocked
                  ? "border-bamboo/40 bg-bamboo/10"
                  : current
                    ? "border-cherry/30 bg-petal/40"
                    : "border-dashed border-border bg-background opacity-65"
              }`}
            >
              {current && (
                <span className="absolute right-3 top-3 rounded-full bg-cherry px-2 py-1 text-[9px] font-bold uppercase text-cream">
                  Next
                </span>
              )}

              <div className="flex gap-3">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                    unlocked
                      ? "bg-bamboo text-cream"
                      : "bg-ink/10 text-ink/50"
                  }`}
                >
                  {unlocked ? "🐾" : m.step}
                </span>

                <div className="min-w-0">
                  <p className="font-semibold">
                    Order {m.step} · {m.title}
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {m.perks.join(" · ")}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {profile.delivered_count >= 5 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-cherry/10 p-4 text-sm">
          <Crown className="h-5 w-5 shrink-0 text-cherry" />
          <span>
            You reached the final Panda Reward. Orders from here on keep your
            perks but unlock nothing new.
          </span>
        </div>
      )}
    </Card>
  );
}

/* =========================================================
   REWARD WALLET
========================================================= */

function RewardWallet({ profile }: { profile: MemberProfile }) {
  const active = profile.rewards.filter((r) => r.kind !== "role");

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-cherry" />
            <h3 className="font-display text-2xl">
              Your rewards
            </h3>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Rewards you've earned from ordering.
          </p>
        </div>

        <span className="grid h-9 w-9 place-items-center rounded-xl bg-petal text-lg">
          🐼
        </span>
      </div>

      {active.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-background p-5 text-center">
          <div className="text-3xl">🎁</div>

          <p className="mt-2 text-sm font-semibold">
            Your reward wallet is empty
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Your first delivered order unlocks 20% off.
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {active.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-petal text-lg">
                  {rewardIcon(r.kind)}
                </span>

                <span className="truncate text-sm font-semibold">
                  {r.label}
                </span>
              </span>

              {r.uses_remaining > 0 ? (
                <span className="shrink-0 rounded-full bg-bamboo/15 px-2.5 py-1 text-[10px] font-bold text-bamboo">
                  {r.kind === "bs_payout"
                    ? "unpaid"
                    : `${r.uses_remaining} left`}
                </span>
              ) : r.kind === "bs_payout" ? (
                <span className="shrink-0 rounded-full bg-ink/10 px-2.5 py-1 text-[10px] font-bold text-ink/50">
                  paid
                </span>
              ) : r.kind === "discount" ||
                r.kind === "expired_claim" ? (
                <span className="shrink-0 rounded-full bg-ink/10 px-2.5 py-1 text-[10px] font-bold text-ink/50">
                  used
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-petal px-2.5 py-1 text-[10px] font-bold text-cherry">
                  always on
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Reward discounts apply to your whole order and are applied
        automatically at checkout. Discounts never stack.
      </p>
    </Card>
  );
}

/* =========================================================
   PERKS
========================================================= */

function PerksCard({ profile }: { profile: MemberProfile }) {
  const pickup =
    profile.pickup_hours === 0
      ? "No pickup time limit"
      : `Pickup within ${profile.pickup_hours} hours`;

  const tier = profile.priority_tier
    ? `${
        profile.priority_tier === "mid"
          ? "Mid"
          : profile.priority_tier === "high"
            ? "High"
            : "Low"
      } priority`
    : "Standard queue";

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-cherry" />
        <h3 className="font-display text-2xl">
          Priority perks
        </h3>
      </div>

      <div className="mt-5 grid gap-2">
        <PerkRow
          icon={<Zap className="h-4 w-4" />}
          label="Queue"
          value={tier}
        />

        <PerkRow
          icon={<Clock3 className="h-4 w-4" />}
          label="Pickup"
          value={pickup}
        />

        <PerkRow
          icon={<Gift className="h-4 w-4" />}
          label="Giveaway entries"
          value={profile.giveaway_entries.toString()}
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Standard pickup is 24 hours. Higher purchased priority can override
        your automatic priority.
      </p>
    </Card>
  );
}

function PerkRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-ink/60">
        <span className="text-cherry">{icon}</span>
        {label}
      </span>

      <span className="text-right text-sm font-semibold">
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   B$
========================================================= */

function BsCard({ profile }: { profile: MemberProfile }) {
  const rows = [
    {
      label: "B$ owed to you",
      value: profile.bs_owed,
      accent: true,
    },
    {
      label: "B$ rewards paid",
      value: profile.bs_paid,
    },
    {
      label: "B$ spent on priority",
      value: profile.bs_spent_priority,
    },
    {
      label: "B$ spent on orders",
      value: profile.bs_spent_orders,
    },
  ];

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-cherry" />
        <h3 className="font-display text-2xl">
          B$ summary
        </h3>
      </div>

      <div className="mt-5 space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-2xl bg-background px-4 py-3"
          >
            <span className="text-sm text-ink/60">
              {r.label}
            </span>

            <span
              className={`font-display text-lg tabular-nums ${
                r.accent ? "text-cherry" : ""
              }`}
            >
              B${r.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        B$ is your in-game cash. Reward payouts are handed to you in-game by
        your chef.
      </p>
    </Card>
  );
}

/* =========================================================
   EXPIRED DISCOUNTS
========================================================= */

function ExpiredClaims({ username }: { username: string }) {
  // Feature disabled — no list_claimable_expired_discounts RPC / no DB.
  void username;
  const list: Array<{
    id: string;
    name: string;
    discount_type: "percentage" | "fixed";
    value: number;
    claimed: boolean;
    claims_left: number;
  }> = [];
  const claimsLeft = 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-cherry" />
            <h3 className="font-display text-2xl">
              Expired discounts
            </h3>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Expired-discount claims are turned off (no database).
          </p>
        </div>

        <span className="rounded-full bg-petal px-3 py-1.5 text-xs font-bold text-cherry">
          {claimsLeft} claim{claimsLeft === 1 ? "" : "s"} available
        </span>
      </div>

      {list.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-background p-5 text-center">
          <div className="text-2xl">🌸</div>
          <p className="mt-2 text-sm text-muted-foreground">
            No expired discounts around right now.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/* =========================================================
   ORDER HISTORY
========================================================= */

function OrderHistory({
  orders,
}: {
  orders: Array<{
    id: string;
    total_bs: number;
    status: string;
    created_at: string;
    item_count: number;
  }>;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-cherry" />
            <h3 className="font-display text-2xl">
              Order history
            </h3>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Your Panda Bites journey.
          </p>
        </div>

        <span className="hidden text-xl sm:block">🍜</span>
      </div>

      {orders.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-background p-6 text-center">
          <div className="text-3xl">🛍️</div>

          <p className="mt-2 text-sm text-muted-foreground">
            No orders yet.
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                to="/order/$id"
                params={{ id: o.id }}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition hover:border-cherry/40 hover:bg-petal/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-petal text-cherry">
                    <ShoppingBag className="h-4 w-4" />
                  </span>

                  <div className="min-w-0">
                    <p className="font-semibold">
                      #{o.id.slice(0, 8)}
                    </p>

                    <p className="truncate text-xs text-muted-foreground">
                      {formatDistanceToNow(
                        new Date(o.created_at),
                        { addSuffix: true },
                      )}{" "}
                      · {o.item_count} item
                      {o.item_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="font-display text-lg tabular-nums">
                      B${o.total_bs.toLocaleString()}
                    </p>

                    <p className="text-[10px] font-bold uppercase tracking-widest text-cherry">
                      {o.status}
                    </p>
                  </div>

                  <ChevronRight className="hidden h-4 w-4 text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-cherry sm:block" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* =========================================================
   EMPTY STATE
========================================================= */

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-border bg-card p-10 text-center shadow-sm">
      <div className="pointer-events-none absolute left-5 top-5 text-lg opacity-20">
        ✦
      </div>

      <div className="pointer-events-none absolute right-6 top-4 text-2xl opacity-20">
        🌸
      </div>

      <div className="text-4xl">{icon}</div>

      <p className="mt-3 font-display text-2xl">
        {title}
      </p>

      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
