import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Global React Query defaults tuned to cut Supabase / Lovable DB load.
 * Without these, every remount and preload refetches immediately (staleTime 0).
 */
export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Was 0 — every link preload hit the DB again
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
