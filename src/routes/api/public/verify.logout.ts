import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/verify/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { buildClearCookies, appendCookies } = await import("@/lib/verify-cookie.server");
        const headers = new Headers({ "content-type": "application/json" });
        appendCookies(headers, buildClearCookies(request));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      },
    },
  },
});