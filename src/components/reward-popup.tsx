import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import {
  ackRewards,
  getUnseenRewards,
  type UnseenRewardGroup,
} from "@/lib/members.functions";
import {
  ackRewardMilestoneLocal,
  getSeenRewardMilestones,
} from "@/lib/client-cache";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

export function RewardPopup() {
  const unseenFn = useServerFn(getUnseenRewards);
  const ackFn = useServerFn(ackRewards);

  const [username, setUsername] = useState("");
  const [queue, setQueue] = useState<UnseenRewardGroup[]>([]);

  /*
   * Keep the popup synced with the username being used on /me.
   *
   * The profile page writes pb_discord_username to localStorage.
   * We also listen for our custom event so the popup updates immediately
   * without requiring a page refresh.
   */
  useEffect(() => {
    const readUsername = () => {
      try {
        const saved =
          window.localStorage.getItem("pb_discord_username") ?? "";

        setUsername(saved.trim().replace(/^@+/, ""));
      } catch {
        setUsername("");
      }
    };

    readUsername();

    window.addEventListener("pb:username-changed", readUsername);
    window.addEventListener("storage", readUsername);

    return () => {
      window.removeEventListener(
        "pb:username-changed",
        readUsername,
      );
      window.removeEventListener("storage", readUsername);
    };
  }, []);

  /*
   * Check for newly unlocked rewards.
   *
   * No polling at all — this fires exactly once per mount (page load)
   * and again if the username changes (e.g. someone types their
   * Discord username in on /me). No setInterval, no repeat calls while
   * the tab sits open. A chef marking an order delivered will show up
   * for the customer the next time they load a page, not live within
   * the same idle tab — that trade-off is what keeps this from calling
   * Lovable Cloud in a loop.
   */
  useEffect(() => {
    const cleanUsername = username.trim().replace(/^@+/, "");

    if (cleanUsername.length < 2) {
      setQueue([]);
      return;
    }

    let stopped = false;

    const load = async () => {
      try {
        const groups = await unseenFn({
          data: {
            username: cleanUsername,
          },
        });
        // Filter out milestones already acknowledged in localStorage (no DB ack).
        const seen = new Set(getSeenRewardMilestones(cleanUsername));
        const filtered = (groups ?? []).filter((g) => !seen.has(g.milestone));

        if (!stopped) {
          setQueue(filtered);
        }
      } catch {
        // Reward popup should never break the rest of the website.
      }
    };

    load();

    return () => {
      stopped = true;
    };
  }, [username, unseenFn]);

  const current = queue[0];

  async function dismiss() {
    if (!current) return;

    const milestone = current.milestone;
    const cleanUsername = username.trim().replace(/^@+/, "");

    // Remove it immediately so the UI feels instant.
    setQueue((q) => q.slice(1));

    // Local-only ack — no member_rewards DB write.
    ackRewardMilestoneLocal(cleanUsername, milestone);

    try {
      await ackFn({
        data: {
          username: cleanUsername,
          milestone,
        },
      });
    } catch {
      /* server is no-op */
    }
  }

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{
              scale: 0.7,
              y: 30,
              opacity: 0,
            }}
            animate={{
              scale: 1,
              y: 0,
              opacity: 1,
            }}
            exit={{
              scale: 0.9,
              opacity: 0,
            }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 20,
            }}
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] border-4 border-cherry/30 bg-cream p-8 text-center shadow-2xl"
          >
            {/* Lightweight decoration */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute text-2xl"
                style={{
                  left: `${8 + i * 16}%`,
                  top: -20,
                }}
                initial={{
                  y: -30,
                  opacity: 0,
                  rotate: 0,
                }}
                animate={{
                  y: 340,
                  opacity: [0, 1, 1, 0],
                  rotate: 220,
                }}
                transition={{
                  duration: 2.6,
                  delay: i * 0.18,
                  repeat: Infinity,
                  repeatDelay: 1.2,
                }}
              >
                🎋
              </motion.span>
            ))}

            <motion.div
              animate={{
                rotate: [-6, 6, -6],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
              }}
              className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-ink text-4xl"
            >
              🐼
            </motion.div>

            <p className="mt-4 text-[0.65rem] font-bold uppercase tracking-[0.3em] text-cherry">
              Panda Reward Unlocked!
            </p>

            <h2 className="mt-2 font-display text-3xl">
              You completed your{" "}
              {ORDINAL[current.milestone] ??
                `${current.milestone}th`}{" "}
              order!
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Your new Panda Rewards have been added automatically.
            </p>

            <ul className="mt-5 space-y-2 text-left">
              {current.rewards.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{
                    opacity: 0,
                    x: -12,
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                  }}
                  transition={{
                    delay: 0.15 + i * 0.08,
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold"
                >
                  <span className="text-lg">
                    {rewardIcon(r.kind)}
                  </span>

                  {r.label}
                </motion.li>
              ))}
            </ul>

            <button
              onClick={dismiss}
              className="pb-press mt-6 w-full rounded-full bg-cherry py-3 font-bold text-cream transition hover:bg-ink"
            >
              Yay, thank you! 🐼
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function rewardIcon(kind: string) {
  switch (kind) {
    case "discount":
      return "🏷️";

    case "priority":
      return "⚡";

    case "pickup":
      return "⏳";

    case "role":
      return "👑";

    case "giveaway":
      return "🎉";

    case "bs_payout":
      return "💰";

    case "expired_claim":
      return "🕰️";

    default:
      return "🐼";
  }
}
