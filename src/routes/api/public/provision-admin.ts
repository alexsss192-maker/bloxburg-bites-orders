import { createFileRoute } from "@tanstack/react-router";
import { provisionAdmin } from "@/lib/provision-admin.functions";

export const Route = createFileRoute("/api/public/provision-admin")({
  server: { handlers: { POST: async () => Response.json(await provisionAdmin()) } },
});
