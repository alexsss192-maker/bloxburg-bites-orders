import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/verify/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { buildClearCookie } = await import("@/lib/verify-cookie.server");
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json", "set-cookie": buildClearCookie(request) },
        });
      },
    },
  },
});