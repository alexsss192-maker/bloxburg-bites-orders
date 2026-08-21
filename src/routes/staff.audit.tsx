import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/staff/audit")({
  head: () => ({
    meta: [
      { title: "Audit — Panda Bites Staff" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

/** Audit DB removed — no panda_audit_log reads/writes. */
function AuditPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cherry">
            <Sparkles className="h-3.5 w-3.5" /> Panda · Audit
          </p>
          <h1 className="mt-1 font-display text-3xl">Audit log disabled</h1>
          <p className="mt-2 max-w-lg text-sm text-ink/60">
            Database audit logging was removed to cut Supabase usage. Skippe and
            kitchen tools no longer write to <code>panda_audit_log</code>.
          </p>
        </div>
        <Link
          to="/staff/panda"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-blossom"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Skippe
        </Link>
      </div>
      <div className="rounded-3xl border border-dashed border-ink/15 bg-white p-10 text-center text-sm text-ink/50">
        No audit entries. This page does not query the database.
      </div>
    </div>
  );
}
