import { createServerFn } from "@tanstack/react-start";

export const provisionAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = "alex@pandabites.local";
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "Forever Panda Bites",
    email_confirm: true,
    user_metadata: { username: "Alex" },
  });
  let userId = data?.user?.id;
  if (error && !userId) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = list?.users.find((u) => u.email === email)?.id;
    if (userId) await supabaseAdmin.auth.admin.updateUserById(userId, { password: "Forever Panda Bites" });
  }
  if (!userId) return { ok: false, error: error?.message ?? "no user" };
  const { error: rerr } = await supabaseAdmin
    .from("user_roles" as never)
    .upsert([{ user_id: userId, role: "admin", source: "manual" }] as never, { onConflict: "user_id,role" });
  return { ok: !rerr, userId, roleError: rerr?.message ?? null };
});
