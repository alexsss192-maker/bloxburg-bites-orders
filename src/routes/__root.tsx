import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import {
  useEffect,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  diagnoseBug,
  formatBugDiagnosisForCopy,
  installGlobalBugDetector,
  type BugDiagnosis,
} from "../lib/bug-detector";
import {
  parseErrorStack,
  findLikelySourceFrame,
  formatErrorForCopy,
  type ParsedStackFrame,
} from "../lib/parse-error-stack";
import {
  resolveStackFrames,
  findLikelyResolvedSourceFrame,
  type ResolvedStackFrame,
} from "../lib/resolve-source-map";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function levelStyles(level: BugDiagnosis["level"] | null, isSecurity: boolean) {
  if (isSecurity || level === "critical" || level === "high") {
    return {
      shell: "rounded-lg border border-amber-500/40 bg-amber-500/5",
      head: "border-b border-amber-500/40 px-5 py-4",
      label:
        "text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400",
      section: "space-y-3 border-b border-amber-500/40 px-5 py-4 text-sm",
    };
  }
  return {
    shell: "rounded-lg border border-destructive/30 bg-destructive/5",
    head: "border-b border-destructive/30 px-5 py-4",
    label: "text-xs font-semibold uppercase tracking-wide text-destructive",
    section: "space-y-3 border-b border-destructive/30 px-5 py-4 text-sm",
  };
}

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  console.error(error);

  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [resolvedFrames, setResolvedFrames] = useState<
    ResolvedStackFrame[] | null
  >(null);

  const bug = diagnoseBug(error);

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
      bug_family: bug?.family ?? null,
      bug_score: bug?.score ?? null,
      bug_fingerprint: bug?.fingerprint ?? null,
      confirmed_cause: bug?.confirmed.statement ?? null,
      confirmed_fix: bug?.confirmed.fix ?? null,
      security_risk: bug?.isSecurityRelated ?? false,
    });
  }, [
    error,
    bug?.family,
    bug?.score,
    bug?.fingerprint,
    bug?.isSecurityRelated,
    bug?.confirmed.statement,
    bug?.confirmed.fix,
  ]);

  const frames: ParsedStackFrame[] = parseErrorStack(error);
  const minifiedSourceFrame = findLikelySourceFrame(frames);

  useEffect(() => {
    let active = true;
    resolveStackFrames(frames)
      .then((resolved) => {
        if (active) setResolvedFrames(resolved);
      })
      .catch(() => {
        if (active) setResolvedFrames(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const displayFrames = resolvedFrames ?? frames;
  const sourceFrame = resolvedFrames
    ? findLikelyResolvedSourceFrame(resolvedFrames)
    : minifiedSourceFrame;

  const resolvedSourceFrame =
    sourceFrame && "originalFile" in sourceFrame
      ? (sourceFrame as ResolvedStackFrame)
      : null;

  const displayFile =
    resolvedSourceFrame?.originalFile ??
    bug?.confirmed.location?.split(":")[0] ??
    sourceFrame?.file ??
    null;
  const displayLine =
    resolvedSourceFrame?.originalLine ??
    (bug?.features.primaryLine ?? sourceFrame?.line ?? null);
  const displayColumn =
    resolvedSourceFrame?.originalColumn ?? sourceFrame?.column ?? null;
  const displayFnName =
    resolvedSourceFrame?.originalName ?? sourceFrame?.functionName ?? null;
  const isRealSource = Boolean(
    resolvedSourceFrame?.originalFile || bug?.features.primaryFile,
  );

  const isSecurity = Boolean(bug?.isSecurityRelated);
  const styles = levelStyles(bug?.level ?? null, isSecurity);

  const copyText = bug
    ? formatBugDiagnosisForCopy(bug)
    : formatErrorForCopy(error, frames);

  function handleCopy() {
    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  }

  return (
    <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-background px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className={styles.shell}>
          <div className={styles.head}>
            <p className={styles.label}>
              {bug
                ? isSecurity
                  ? `Security · ${bug.level} · score ${bug.score}`
                  : `Bug · ${bug.family} · ${bug.level} · score ${bug.score}`
                : "This page crashed"}
            </p>

            <h1 className="mt-1 text-lg font-semibold text-foreground">
              {bug
                ? bug.title
                : `${error.name || "Error"}: ${error.message || "Unknown error"}`}
            </h1>

            {bug ? (
              <p className="mt-1 text-xs text-muted-foreground">
                confidence {bug.confidence}
                {bug.fingerprint ? ` · ${bug.fingerprint}` : ""}
              </p>
            ) : null}
          </div>

          {bug ? (
            <div className={styles.section}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Confirmed cause
                </p>
                <p className="mt-1 text-foreground/90">
                  {bug.confirmed.statement}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Confirmed fix
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {bug.confirmed.fix}
                </p>
              </div>
              {bug.confirmed.location ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </p>
                  <p className="mt-1 font-mono text-xs text-foreground/90">
                    {bug.confirmed.location}
                  </p>
                </div>
              ) : null}
              {bug.evidence.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Detection evidence
                  </p>
                  <ul className="mt-1 list-inside list-disc font-mono text-xs text-foreground/80">
                    {bug.evidence.slice(0, 8).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {bug.sqlHints?.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SQL hints (run manually)
                  </p>
                  <pre className="mt-1 max-h-24 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                    {bug.sqlHints.join("\n")}
                  </pre>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Raw error
                </p>
                <pre className="mt-1 max-h-28 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                  {error.name || "Error"}: {error.message || "Unknown error"}
                </pre>
              </div>
            </div>
          ) : null}

          {displayFile && (
            <div className="border-b border-destructive/30 px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Likely source
                </p>
                {resolvedFrames === null && (
                  <p className="text-xs text-muted-foreground">
                    Resolving original source…
                  </p>
                )}
                {resolvedFrames !== null && !isRealSource && (
                  <p className="text-xs text-muted-foreground">
                    Minified location (sourcemap unavailable)
                  </p>
                )}
              </div>
              <p className="mt-1 break-all font-mono text-sm text-foreground">
                {displayFile}
                {displayLine != null && (
                  <span className="text-muted-foreground">
                    :{displayLine}:{displayColumn}
                  </span>
                )}
              </p>
              {displayFnName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  in {displayFnName}()
                </p>
              )}
            </div>
          )}

          {frames.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Full stack trace
              </p>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-5 text-foreground">
                {displayFrames
                  .map((fr) => {
                    const resolved =
                      "originalFile" in fr
                        ? (fr as ResolvedStackFrame)
                        : null;
                    if (resolved?.originalFile) {
                      return `at ${resolved.originalName ?? resolved.functionName ?? "(anonymous)"} — ${resolved.originalFile}:${resolved.originalLine}:${resolved.originalColumn}`;
                    }
                    return fr.file
                      ? `at ${fr.functionName ?? "(anonymous)"} — ${fr.file}:${fr.line}:${fr.column}`
                      : fr.raw;
                  })
                  .join("\n")}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-destructive/30 px-5 py-4">
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              {copied ? "Copied!" : "Copy error details"}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Panda Bites — Bloxburg food shop",
      },
      {
        name: "description",
        content:
          "Order non-seasonal Bloxburg foods from the Panda Bites Discord shop. Pay in B$, delivered in-game by our chefs.",
      },
      {
        name: "author",
        content: "Panda Bites",
      },
      {
        property: "og:title",
        content: "Panda Bites — Bloxburg food shop",
      },
      {
        property: "og:description",
        content:
          "Order non-seasonal Bloxburg foods. Pay in B$ inside Panda Bites Discord.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [RewardPopup, setRewardPopup] =
    useState<ComponentType | null>(null);

  // GLOBAL — every file, no per-route edits
  useEffect(() => {
    return installGlobalBugDetector();
  }, []);

  useEffect(() => {
    let active = true;
    import("../components/reward-popup")
      .then((module) => {
        if (active) setRewardPopup(() => module.RewardPopup);
      })
      .catch((err) => {
        console.error("Failed to load reward popup:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {RewardPopup ? <RewardPopup /> : null}
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
