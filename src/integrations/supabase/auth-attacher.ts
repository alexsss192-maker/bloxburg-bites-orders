import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({
  type: "function",
}).client(async ({ next }) => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Unable to get Supabase session:", error);
      return next();
    }

    const token = data.session?.access_token;

    return next({
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    });
  } catch (error) {
    console.error("Supabase auth middleware failed:", error);

    // Do not let an auth problem crash public pages.
    return next();
  }
});
