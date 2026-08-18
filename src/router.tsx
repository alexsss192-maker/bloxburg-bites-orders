import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { reportQueryBug } from "./lib/bug-detector";

/**
 * Global React Query defaults + global bug reporting on every query/mutation error.
 * No per-page edits required — any useQuery/useMutation failure is classified.
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
        throwOnError: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated") {
      const err = event.query.state.error;
      if (err) {
        reportQueryBug(err, {
          queryHash: event.query.queryHash,
          queryKey: JSON.stringify(event.query.queryKey).slice(0, 200),
        });
      }
    }
  });

  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.mutation.state.error) {
      reportQueryBug(event.mutation.state.error, {
        mutationKey: JSON.stringify(
          event.mutation.options.mutationKey ?? [],
        ).slice(0, 200),
      });
    }
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
