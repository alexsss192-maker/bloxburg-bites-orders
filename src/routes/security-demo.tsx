import { createFileRoute } from "@tanstack/react-router";

/**
 * DEMO ONLY — visit /security-demo once to preview the amber
 * "Security risk" error card from diagnoseSecurityRisk().
 *
 * Throws a permission/RLS-style message (no real attack, no secrets).
 * Lovable will not block this; it is a normal runtime Error.
 *
 * Delete this file (and the route) after you have seen the UI.
 */
export const Route = createFileRoute("/security-demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Security demo — Panda Bites" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityDemoPage,
});

function SecurityDemoPage(): never {
  // Matches diagnoseSecurityRisk() "Row Level Security / permission denied" branch
  throw new Error(
    "permission denied for table public.staff_profiles: violates row-level security policy (42501). " +
      "JWT role authenticated is not allowed SELECT on this relation.",
  );
}
