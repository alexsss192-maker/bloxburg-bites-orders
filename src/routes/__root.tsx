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
} from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
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
import { RewardPopup } from "../components/reward-popup";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>

        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
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

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  const frames: ParsedStackFrame[] = parseErrorStack(error);
  const minifiedSourceFrame = findLikelySourceFrame(frames);

  useEffect(() => {
    let active = true;

    resolveStackFrames(frames)
      .then((nextFrames) => {
        if (active) {
          setResolvedFrames(nextFrames);
        }
      })
      .catch(() => {
        if (active) {
          setResolvedFrames(null);
        }
      });

    return () => {
      active = false;
    };
  }, [error]);

  const resolvedSourceFrame = resolvedFrames
    ? findLikelyResolvedSourceFrame(resolvedFrames)
    : null;

  const copyDetails = async () => {
    try {
      const details = formatErrorForCopy(
        error,
        minifiedSourceFrame,
        resolvedSourceFrame,
      );

      await navigator.clipboard.writeText(details);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  const goHome = () => {
    router.navigate({
      to: "/",
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">
              Something went wrong
            </p>

            <h1 className="mt-2 text-2xl font-bold text-foreground">
              The page could not be loaded.
            </h1>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You can try again or return to the homepage. The error details
              below can be copied for debugging.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Error
              </p>
            </div>

            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-4 py-4 text-xs leading-5 text-foreground">
              {error.message}
            </pre>
          </div>

          {resolvedSourceFrame && (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Likely source
              </p>

              <p className="mt-1 break-all font-mono text-xs text-foreground">
                {resolvedSourceFrame.file}:{resolvedSourceFrame.line}
                {resolvedSourceFrame.column
                  ? `:${resolvedSourceFrame.column}`
                  : ""}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                reset();
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>

            <button
              type="button"
              onClick={copyDetails}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {copied ? "Copied!" : "Copy error"}
            </button>

            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route =
  createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
          rel: "icon",
          href: "/favicon.ico",
          type: "image/x-icon",
        },
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
        },
        {
          rel: "stylesheet",
          href:
            "https://fonts.googleapis.com/css2?family=Syne:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
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

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />

      <RewardPopup />

      <Toaster
        position="top-right"
        richColors
        closeButton
      />
    </QueryClientProvider>
  );
}
