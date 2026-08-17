/**
 * Detects security- and permissions-related failures and turns them into
 * the same kind of rich diagnosis card Skippe already uses for kitchen bugs.
 */

export type SecurityRiskLevel = "critical" | "high" | "medium" | "low";

export type SecurityDiagnosis = {
  /** True when the error looks security / auth / RLS related */
  isSecurityRisk: boolean;
  level: SecurityRiskLevel;
  /** Short headline shown in the error card */
  title: string;
  /** Human explanation of the risk */
  risk: string;
  /** Why it likely happened */
  why: string;
  /** Where to look in the project */
  where: string;
  /** Concrete fix steps */
  fix: string;
  /** Original error text */
  message: string;
};

function textFromUnknown(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join("\n");
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Returns a security diagnosis when the error matches known auth, RLS,
 * privilege, or schema-exposure patterns. Otherwise returns null.
 */
export function diagnoseSecurityRisk(error: unknown): SecurityDiagnosis | null {
  const text = textFromUnknown(error);
  if (!text.trim()) return null;

  // --- Row Level Security / permission denied ---
  if (
    /row-level security|violates row-level security|permission denied for (table|relation|schema|function)|42501/i.test(
      text,
    )
  ) {
    return {
      isSecurityRisk: true,
      level: "high",
      title: "Row Level Security blocked this action",
      risk: "Postgres RLS rejected the query. Either the signed-in role is not allowed, or no policy matches this operation.",
      why: "Supabase applies RLS on every table with ENABLE ROW LEVEL SECURITY. Missing SELECT/INSERT/UPDATE/DELETE policies, or policies that check auth.uid() while the request is anonymous, cause this.",
      where: "supabase/migrations/*.sql (CREATE POLICY …) · client uses anon or authenticated JWT · server functions may need service role for admin work",
      fix: "1) Identify the table/function in the error. 2) In Cloud → SQL editor, list policies: SELECT * FROM pg_policies WHERE tablename = '…'. 3) Add or fix a policy for the role (anon / authenticated) and command. 4) For staff-only tables, ensure the user has user_roles + is_staff(). 5) NOTIFY pgrst, 'reload schema';",
      message: text,
    };
  }

  // --- Forbidden / not staff / admin only ---
  if (
    /forbidden|not (authorized|allowed)|admin only|staff only|insufficient privilege|access denied|401|403|JWT|invalid (jwt|token|claim)|session (expired|missing)/i.test(
      text,
    )
  ) {
    return {
      isSecurityRisk: true,
      level: "high",
      title: "Authorization failed",
      risk: "The request was rejected because the user is anonymous, not staff, not admin, or the session is invalid.",
      why: "Staff routes and server functions call assertStaff / has_role / is_staff. Missing user_roles rows, expired sessions, or calling admin-only APIs as a chef trigger this.",
      where: "src/integrations/supabase/auth-middleware.ts · src/lib/menu.functions.ts (assertStaff) · public.user_roles · public.has_role() / is_staff()",
      fix: "1) Sign in again on /staff. 2) Confirm public.user_roles has role 'admin' or 'chef' for your auth.users id. 3) Confirm staff_profiles exists for that user. 4) Do not expose service-role keys to the browser.",
      message: text,
    };
  }

  // --- Schema cache / missing table or function ---
  if (
    /schema cache|could not find the (table|function|column)|PGRST204|PGRST202|PGRST205/i.test(
      text,
    )
  ) {
    const tableMatch = text.match(
      /table ['"]?public\.([a-z0-9_]+)|['"]public\.([a-z0-9_]+)['"]/i,
    );
    const fnMatch = text.match(
      /function ['"]?public\.([a-z0-9_]+)|public\.([a-z0-9_]+)\(/i,
    );
    const colMatch = text.match(/column ['"]?([a-z0-9_]+)['"]?/i);
    const target =
      tableMatch?.[1] ||
      tableMatch?.[2] ||
      fnMatch?.[1] ||
      fnMatch?.[2] ||
      colMatch?.[1] ||
      "object";

    return {
      isSecurityRisk: true,
      level: "medium",
      title: `API schema missing: ${target}`,
      risk: "PostgREST does not expose this table, column, or function. Callers get a hard failure instead of data. Unapplied migrations leave the live DB behind the code — a common source of broken auth and permission checks too.",
      why: "Lovable Cloud migrations in supabase/migrations/ were not all applied to the live database, or the schema cache was not reloaded after a change.",
      where: `supabase/migrations/ (search for ${target}) · Cloud → SQL editor · NOTIFY pgrst, 'reload schema'`,
      fix: `1) Open Cloud → SQL editor. 2) Create/alter the missing ${target} from the matching migration file. 3) GRANT appropriate privileges to anon/authenticated/service_role. 4) Run: NOTIFY pgrst, 'reload schema'; 5) Retry the action.`,
      message: text,
    };
  }

  // --- Foreign key / identity issues ---
  if (
    /violates foreign key constraint|user_id_fkey|auth\.users|is not present in table \"users\"/i.test(
      text,
    )
  ) {
    return {
      isSecurityRisk: true,
      level: "medium",
      title: "User identity does not exist in Auth",
      risk: "Code tried to attach a role or profile to a user_id that is not in auth.users. Staff/admin grants for fake UUIDs never work and can hide real access problems.",
      why: "INSERT into user_roles or staff_profiles used a placeholder UUID, or the Auth user was deleted while dependent rows remained.",
      where: "public.user_roles · public.staff_profiles · Cloud → Users · auth.users",
      fix: "1) SELECT id, email FROM auth.users. 2) Only insert roles/profiles for real ids. 3) Delete orphaned rows if the auth user is gone.",
      message: text,
    };
  }

  // --- Explicit security keywords ---
  if (
    /security (risk|issue|vulnerability)|xss|csrf|sql injection|exposed (secret|key|service.?role)|service.?role.*(client|browser|vite)/i.test(
      text,
    )
  ) {
    return {
      isSecurityRisk: true,
      level: "critical",
      title: "Possible security vulnerability signal",
      risk: "The error text suggests secrets exposure or an injection-class failure. Treat as urgent.",
      why: "Service role keys must never ship to the browser. User input must not be concatenated into raw SQL.",
      where: "src/integrations/supabase/client.ts (publishable only) · client.server.ts (service role, server-only) · .env / Cloud → Secrets",
      fix: "1) Rotate any key that may have been exposed. 2) Confirm VITE_/public env vars only contain publishable keys. 3) Keep service role on the server. 4) Use parameterized queries / Supabase client only.",
      message: text,
    };
  }

  // --- Wrong password / invalid login ---
  if (/wrong username or password|invalid login credentials|invalid_credentials/i.test(text)) {
    return {
      isSecurityRisk: true,
      level: "low",
      title: "Staff login credentials rejected",
      risk: "Failed staff authentication. Repeated failures can indicate credential stuffing; ensure accounts use strong passwords.",
      why: "Staff usernames map to email {normalized}@pandabites.local. Wrong password hash, unconfirmed email, or mismatched username all fail the same way.",
      where: "src/routes/staff.tsx · src/lib/staff-username.ts · auth.users",
      fix: "1) Confirm email is username@pandabites.local in auth.users. 2) Reset password via SQL crypt() if Cloud UI has no reset. 3) Ensure email_confirmed_at is set.",
      message: text,
    };
  }

  return null;
}

/** True when diagnoseSecurityRisk would flag this error. */
export function isSecurityRiskError(error: unknown): boolean {
  return diagnoseSecurityRisk(error)?.isSecurityRisk === true;
}

/** Plain-text block for “Copy error details”. */
export function formatSecurityDiagnosisForCopy(
  diagnosis: SecurityDiagnosis,
): string {
  return [
    `[SECURITY ${diagnosis.level.toUpperCase()}] ${diagnosis.title}`,
    "",
    `Risk: ${diagnosis.risk}`,
    `Why: ${diagnosis.why}`,
    `Where: ${diagnosis.where}`,
    `Fix: ${diagnosis.fix}`,
    "",
    "Raw:",
    diagnosis.message,
  ].join("\n");
}
