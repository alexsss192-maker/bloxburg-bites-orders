import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bootstrap")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = "Hellosavagesavage79@pandabites.local";
        const password = "Panda Bites";

        // Check if user exists
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        let user = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

        if (!user) {
          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email, password, email_confirm: true,
          });
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          user = data.user!;
        }

        const { error: roleErr } = await supabaseAdmin
          .from("user_roles" as never)
          .upsert({ user_id: user.id, role: "admin" } as never, { onConflict: "user_id,role" });
        if (roleErr) return Response.json({ ok: false, error: roleErr.message }, { status: 500 });

        return Response.json({ ok: true, email, user_id: user.id });
      },
    },
  },
});