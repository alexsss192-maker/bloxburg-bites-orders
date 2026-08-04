import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/verify/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { readVerifiedSession } = await import("@/lib/verify-cookie.server");
        const payload = readVerifiedSession(request.headers.get("cookie"));
        return Response.json(
          payload
            ? { discord_id: payload.discord_id, username: payload.username, avatar_url: payload.avatar_url }
            : null,
          { headers: { "cache-control": "no-store, private" } },
        );
      },
    },
  },
});