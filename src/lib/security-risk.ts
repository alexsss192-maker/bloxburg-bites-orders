/**
 * security-risk.ts
 * ---------------------------------------------------------------------------
 * Ultra-advanced runtime security-error intelligence for Panda Bites / Lovable.
 *
 * Pure client-side. No Supabase, no fetch, no DB, no secrets.
 * Classifies thrown errors so the root ErrorComponent (and soft UIs) can show
 * a rich amber security card with score, confidence, evidence, and fixes.
 *
 * Pipeline:
 *   1. Normalize + extract entities (tables, RPCs, SQLSTATE, PGRST, UUIDs…)
 *   2. Run weighted multi-rule matching with evidence capture
 *   3. Score (severity × confidence × signal density)
 *   4. Compound / chain analysis (bump severity when multiple families fire)
 *   5. Build actionable diagnosis + copy block
 */

export type SecurityLevel = "critical" | "high" | "medium" | "low" | "info";

export type SecurityCategory =
  | "secret_exposure"
  | "injection"
  | "rls_permission"
  | "auth_session"
  | "schema_cache"
  | "identity_fk"
  | "authorization"
  | "cors_csp"
  | "rate_limit"
  | "webhook_crypto"
  | "ssrf_path"
  | "open_redirect"
  | "idor"
  | "debug_leak"
  | "lovable_supabase"
  | "data_integrity"
  | "crypto_tls"
  | "supply_chain"
  | "generic";

export type SecurityDiagnosis = {
  isSecurityRisk: true;
  level: SecurityLevel;
  category: SecurityCategory;
  title: string;
  risk: string;
  why: string;
  where: string;
  fix: string;
  message: string;
  /** Composite 0–100 */
  score: number;
  /** 0–1 */
  confidence: number;
  evidence: string[];
  entities: ExtractedEntities;
  signals: SignalHit[];
  related?: string[];
  /** Short “what to do first” */
  priorityAction: string;
  /** Optional safe, idempotent SQL hints (never auto-run) */
  sqlHints?: string[];
  /** Ordered operator steps (client-only guidance) */
  playbook?: string[];
  /** What an attacker could gain if this class is real */
  blastRadius?: string;
  /** Defense-in-depth checks beyond the primary fix */
  hardening?: string[];
};

export type ExtractedEntities = {
  tables: string[];
  functions: string[];
  columns: string[];
  sqlstates: string[];
  pgrstCodes: string[];
  httpCodes: string[];
  uuids: string[];
  emails: string[];
  jwtLike: string[];
  keyLike: string[];
  hosts: string[];
};

export type SignalHit = {
  ruleId: string;
  category: SecurityCategory;
  level: SecurityLevel;
  weight: number;
  evidence: string[];
};

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

const LEVEL_ORDER: Record<SecurityLevel, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const LEVEL_BUMP: SecurityLevel[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function extractAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const global = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    if (m[1]) out.push(m[1]);
    else if (m[0]) out.push(m[0]);
  }
  return uniq(out);
}

function resolve(
  value: string | ((ctx: RuleContext) => string),
  ctx: RuleContext,
): string {
  return typeof value === "function" ? value(ctx) : value;
}

/* -------------------------------------------------------------------------- */
/*  Entity extraction (runs once per diagnosis)                               */
/* -------------------------------------------------------------------------- */

function extractEntities(text: string): ExtractedEntities {
  return {
    tables: extractAll(
      text,
      /(?:table|relation|from|into|update|join)\s+["']?(?:public\.)?([a-z][a-z0-9_]*)["']?/gi,
    ).concat(
      extractAll(text, /public\.([a-z][a-z0-9_]*)/gi),
    ),
    functions: extractAll(
      text,
      /function\s+["']?(?:public\.)?([a-z][a-z0-9_]*)/gi,
    ).concat(
      extractAll(text, /public\.([a-z][a-z0-9_]*)\s*\(/gi),
    ),
    columns: extractAll(
      text,
      /column\s+["']?([a-z][a-z0-9_]*)["']?/gi,
    ),
    sqlstates: extractAll(text, /\b([0-9A-Z]{5})\b/g).filter((c) =>
      /^(28|42|23|22|P0)/.test(c),
    ),
    pgrstCodes: extractAll(text, /\b(PGRST\d{3})\b/gi),
    httpCodes: extractAll(text, /\b([45]\d{2})\b/g),
    uuids: extractAll(
      text,
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi,
    ),
    emails: extractAll(
      text,
      /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi,
    ),
    jwtLike: extractAll(
      text,
      /\b(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g,
    ),
    keyLike: extractAll(
      text,
      /\b((?:sk|sbp|supabase)[_-][a-zA-Z0-9]{16,})\b/gi,
    ),
    hosts: extractAll(
      text,
      /\b((?:localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?)\b/gi,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Rule system                                                               */
/* -------------------------------------------------------------------------- */

type RuleContext = {
  text: string;
  lower: string;
  entities: ExtractedEntities;
  evidence: string[];
};

type Rule = {
  id: string;
  category: SecurityCategory;
  level: SecurityLevel;
  /** Base weight 0–100 */
  weight: number;
  /** Return evidence strings or null */
  test: (ctx: RuleContext) => string[] | null;
  title: string | ((ctx: RuleContext) => string);
  risk: string | ((ctx: RuleContext) => string);
  why: string | ((ctx: RuleContext) => string);
  where: string | ((ctx: RuleContext) => string);
  fix: string | ((ctx: RuleContext) => string);
  priorityAction?: string | ((ctx: RuleContext) => string);
  sqlHints?: string[] | ((ctx: RuleContext) => string[]);
};

const RULES: Rule[] = [
  /* ── CRITICAL ─────────────────────────────────────────────────────────── */

  {
    id: "service_role_client_exposure",
    category: "secret_exposure",
    level: "critical",
    weight: 100,
    test: ({ text, lower }) => {
      if (
        /service.?role.*(key|secret|token).*(client|browser|vite|public|window|localstorage|import\.meta)/i.test(
          text,
        ) ||
        /VITE_.*SERVICE.?ROLE|NEXT_PUBLIC_.*SERVICE.?ROLE|SUPABASE_SERVICE_ROLE.*(?:client|browser)/i.test(
          text,
        )
      ) {
        return extractAll(text, /service.?role[_\s]?key/gi).concat(
          extractAll(text, /SUPABASE_SERVICE_ROLE\w*/gi),
        );
      }
      return null;
    },
    title: "Service-role credential appears reachable from the client",
    risk: "A service-role (superuser) key may be present in browser-accessible code or env. That bypasses every RLS policy and grants full database control.",
    why: "Service-role keys must exist only in server-only contexts (Cloud Secrets / server functions). Any VITE_ / public_ prefix that contains them is a complete compromise of the project database.",
    where: "src/integrations/supabase/client.ts · Cloud → Secrets · any client bundle that imports service role",
    fix: "1) Rotate the service-role key in Supabase/Lovable immediately. 2) Confirm only the publishable anon key is in client env. 3) Keep service role exclusively in server modules. 4) Audit recent admin actions in logs.",
    priorityAction: "Rotate service-role key now",
  },

  {
    id: "secret_material_in_error",
    category: "secret_exposure",
    level: "critical",
    weight: 96,
    test: ({ text, entities }) => {
      const hits = [
        ...entities.jwtLike,
        ...entities.keyLike,
        ...extractAll(
          text,
          /password["'\s:=]+([^\s"']{8,})/gi,
        ),
      ];
      return hits.length ? hits.slice(0, 5) : null;
    },
    title: "Possible secret material embedded in error text",
    risk: "Error payloads may contain live JWTs, API keys, or passwords. Anyone who can trigger or read the error obtains usable credentials.",
    why: "Frameworks and SDKs sometimes stringify request config, env objects, or auth headers into Error.message / stack.",
    where: "Error boundaries · console · Lovable telemetry · throws that include request objects",
    fix: "1) Redact Authorization, cookies, and env before throwing or reporting. 2) Rotate every key that appeared. 3) Ensure production error reporting strips secrets.",
    priorityAction: "Rotate any leaked keys and redact future errors",
  },

  {
    id: "sql_injection_signal",
    category: "injection",
    level: "critical",
    weight: 92,
    test: ({ text, lower }) => {
      if (
        /sql injection|union\s+select|sleep\s*\(|benchmark\s*\(|pg_sleep|information_schema|xp_cmdshell|load_file\s*\(/i.test(
          text,
        ) ||
        (/syntax error at or near/i.test(text) &&
          /['";]--/.test(text))
      ) {
        return extractAll(
          text,
          /sql injection|union\s+select|pg_sleep|information_schema/gi,
        );
      }
      return null;
    },
    title: "SQL injection signal detected in error",
    risk: "Error text suggests raw SQL concatenation or a successful injection probe. Data exfiltration or privilege escalation may be possible.",
    why: "User-controlled input must never be interpolated into SQL strings. Always use parameterized queries or the Supabase client.",
    where: "Custom SQL · .rpc with string building · Edge functions that concatenate filters",
    fix: "1) Locate the query that produced the message. 2) Switch to parameterized APIs. 3) Confirm RLS still constrains damage even if injection succeeds. 4) Add strict input validation.",
    priorityAction: "Stop string-building SQL; parameterize immediately",
  },

  {
    id: "xss_signal",
    category: "injection",
    level: "critical",
    weight: 88,
    test: ({ text }) => {
      if (
        /xss|cross-site scripting|<script[\s>]|javascript:|onerror\s*=|onload\s*=|onfocus\s*=/i.test(
          text,
        )
      ) {
        return extractAll(
          text,
          /<script[^>]*>|javascript:|onerror\s*=|onload\s*=/gi,
        );
      }
      return null;
    },
    title: "Cross-site scripting (XSS) signal",
    risk: "Payload or error indicates possible script injection. Session theft and account takeover become realistic.",
    why: "Unescaped user content rendered into HTML or JS contexts.",
    where: "dangerouslySetInnerHTML · HTML templates · user-generated labels in staff UI",
    fix: "1) Never feed untrusted data to dangerouslySetInnerHTML. 2) Rely on React’s default escaping. 3) Sanitize if rich HTML is required. 4) Deploy a strict Content-Security-Policy.",
    priorityAction: "Remove unescaped HTML rendering paths",
  },

  /* ── HIGH ─────────────────────────────────────────────────────────────── */

  {
    id: "rls_permission_denied",
    category: "rls_permission",
    level: "high",
    weight: 82,
    test: ({ text, entities }) => {
      if (
        /row-level security|violates row-level security|permission denied for (table|relation|schema|function)|42501/i.test(
          text,
        )
      ) {
        return uniq([
          ...entities.tables,
          ...entities.functions,
          ...entities.sqlstates.filter((s) => s === "42501"),
          ...extractAll(
            text,
            /permission denied for (?:table|relation|schema|function) ["']?([a-z0-9_.]+)/gi,
          ),
        ]);
      }
      return null;
    },
    title: (ctx) => {
      const target =
        ctx.evidence[0] ||
        ctx.entities.tables[0] ||
        ctx.entities.functions[0] ||
        "object";
      return `Row Level Security blocked access (${target})`;
    },
    risk: "Postgres RLS rejected the query. The signed-in role is not allowed, or no policy matches this operation.",
    why: "Tables with ENABLE ROW LEVEL SECURITY require explicit policies for anon / authenticated / service_role. Missing or mismatched policies surface as 42501.",
    where: (ctx) =>
      `supabase/migrations/*.sql · public.${
        ctx.entities.tables[0] || ctx.entities.functions[0] || "…"
      } · client JWT role`,
    fix: (ctx) =>
      `1) Identify the object (${
        ctx.evidence[0] || "table/function"
      }). 2) SELECT * FROM pg_policies WHERE tablename = '…'. 3) Add or adjust the policy for the correct role + command. 4) For staff tables ensure user_roles + is_staff()/has_role(). 5) NOTIFY pgrst, 'reload schema';`,
    priorityAction: "Inspect and fix RLS policies for the named object",
    sqlHints: (ctx) => {
      const t = ctx.entities.tables[0];
      if (!t) return [];
      return [
        `SELECT * FROM pg_policies WHERE tablename = '${t}';`,
        `NOTIFY pgrst, 'reload schema';`,
      ];
    },
  },

  {
    id: "auth_forbidden_jwt",
    category: "authorization",
    level: "high",
    weight: 78,
    test: ({ text }) => {
      if (
        /forbidden|not (authorized|allowed)|admin only|staff only|insufficient privilege|access denied|\b401\b|\b403\b|invalid (jwt|token|claim)|jwt expired|session (expired|missing)/i.test(
          text,
        )
      ) {
        return extractAll(
          text,
          /401|403|JWT|session|forbidden|unauthorized/gi,
        );
      }
      return null;
    },
    title: "Authorization or session rejected",
    risk: "Request failed because the caller is anonymous, lacks staff/admin role, or the JWT/session is invalid.",
    why: "Staff routes call assertStaff / has_role / is_staff. Missing user_roles rows, expired sessions, or calling admin APIs as a non-admin produce this class of error.",
    where: "auth-middleware · assertStaff · public.user_roles · has_role() / is_staff()",
    fix: "1) Sign in again on /staff. 2) Confirm public.user_roles contains admin or chef for your auth.users id. 3) Confirm staff_profiles exists. 4) Never expose service-role keys to the browser.",
    priorityAction: "Verify user_roles + fresh session",
  },

  {
    id: "idor_ownership",
    category: "idor",
    level: "high",
    weight: 74,
    test: ({ text }) => {
      if (
        /not assigned to you|does not belong to|cannot access (another|other) (user|chef|order)|ownership (check|failed)|resource not owned|wrong owner/i.test(
          text,
        )
      ) {
        return ["ownership-check"];
      }
      return null;
    },
    title: "Possible IDOR / ownership violation",
    risk: "Code attempted to read or mutate a resource owned by another principal. If the same check is missing on other paths, horizontal privilege escalation is possible.",
    why: "Skippe and staff tools must scope by chef_id / auth.uid(). Trusting a client-supplied owner id without a server-side filter is a classic IDOR.",
    where: "skippe.server.ts (ownFulfillment) · order_fulfillments · any filter that trusts client owner IDs",
    fix: "1) Always constrain by auth.uid() or server-resolved ownership. 2) Never trust client-supplied owner IDs alone. 3) Mirror the same rule in RLS.",
    priorityAction: "Audit ownership filters on the failing path",
  },

  /* ── MEDIUM ───────────────────────────────────────────────────────────── */

  {
    id: "schema_cache_missing",
    category: "schema_cache",
    level: "medium",
    weight: 70,
    test: ({ text, entities }) => {
      if (
        /schema cache|could not find the (table|function|column)|PGRST204|PGRST202|PGRST205|PGRST116/i.test(
          text,
        )
      ) {
        return uniq([
          ...entities.tables,
          ...entities.functions,
          ...entities.columns,
          ...entities.pgrstCodes,
        ]);
      }
      return null;
    },
    title: (ctx) => {
      const target =
        ctx.entities.tables[0] ||
        ctx.entities.functions[0] ||
        ctx.entities.columns[0] ||
        "object";
      return `API schema missing: ${target}`;
    },
    risk: "PostgREST does not expose this table, column, or function. Callers receive hard failures. Unapplied migrations leave the live database behind the application code.",
    why: "Lovable Cloud migrations under supabase/migrations/ were not fully applied, or the schema cache was never reloaded after a change.",
    where: (ctx) =>
      `supabase/migrations/ (search for ${
        ctx.entities.tables[0] ||
        ctx.entities.functions[0] ||
        "object"
      }) · Cloud → SQL editor`,
    fix: (ctx) =>
      `1) Open Cloud → SQL editor. 2) Create/alter the missing ${
        ctx.entities.tables[0] ||
        ctx.entities.functions[0] ||
        "object"
      } from the matching migration. 3) GRANT privileges to anon/authenticated/service_role. 4) NOTIFY pgrst, 'reload schema'; 5) Retry the action.`,
    priorityAction: "Apply missing migration + reload schema cache",
    sqlHints: ["NOTIFY pgrst, 'reload schema';"],
  },

  {
    id: "fk_auth_users_missing",
    category: "identity_fk",
    level: "medium",
    weight: 66,
    test: ({ text, entities }) => {
      if (
        /violates foreign key constraint|user_id_fkey|is not present in table ["']users["']|auth\.users/i.test(
          text,
        )
      ) {
        return uniq([
          ...entities.uuids,
          ...extractAll(
            text,
            /Key \(user_id\)=\(([^)]+)\)/gi,
          ),
        ]);
      }
      return null;
    },
    title: "User identity does not exist in Auth",
    risk: "Code tried to attach a role or profile to a user_id that is absent from auth.users. Grants for non-existent UUIDs never succeed and can hide real access problems.",
    why: "INSERT into user_roles or staff_profiles used a placeholder, a deleted Auth user, or a UUID from another project.",
    where: "public.user_roles · public.staff_profiles · Cloud → Users · auth.users",
    fix: "1) SELECT id, email FROM auth.users. 2) Only insert roles/profiles for real ids. 3) Delete orphaned rows if the auth user is gone.",
    priorityAction: "Use only real auth.users ids",
    sqlHints: [
      "SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;",
    ],
  },

  {
    id: "cors_csp_block",
    category: "cors_csp",
    level: "medium",
    weight: 58,
    test: ({ text }) => {
      if (
        /cors|cross-origin|access-control-allow-origin|content.security.policy|csp violation|refused to connect|blocked by cors|net::ERR_FAILED/i.test(
          text,
        )
      ) {
        return extractAll(
          text,
          /cors|csp|access-control|cross-origin/gi,
        );
      }
      return null;
    },
    title: "CORS or Content-Security-Policy blocked a request",
    risk: "Browser refused a cross-origin call or blocked a resource under CSP. Misconfiguration can break the app or leave it open to unwanted origins.",
    why: "API and asset origins must be explicitly allowed. Overly permissive CORS is itself a security weakness.",
    where: "Supabase Auth redirect/CORS settings · Lovable hosting headers · meta CSP · external gateway fetches",
    fix: "1) Confirm allowed origins include your production domain. 2) Avoid Access-Control-Allow-Origin: * together with credentials. 3) Tighten CSP while permitting required scripts and styles.",
    priorityAction: "Align CORS/CSP allow-lists with production origin",
  },

  {
    id: "rate_limit_429",
    category: "rate_limit",
    level: "medium",
    weight: 54,
    test: ({ text, entities }) => {
      if (/429|rate.?limit|too many requests|throttl/i.test(text)) {
        return uniq(["429", ...entities.httpCodes.filter((c) => c === "429")]);
      }
      return null;
    },
    title: "Rate limit / throttling engaged",
    risk: "Upstream is rejecting traffic. Persistent 429s often indicate a retry storm, abuse, or exhausted quota — and they burn Lovable/Supabase credits.",
    why: "Aggressive React Query refetch, tight Skippe loops, or missing backoff produce request storms.",
    where: "src/router.tsx (QueryClient defaults) · Skippe tool loops · preview_order_total debounce",
    fix: "1) Raise staleTime and debounce intervals. 2) Cap retries at 1. 3) Back off on 429. 4) Inspect Cloud → Logs for the hottest paths.",
    priorityAction: "Reduce refetch frequency and add backoff",
  },

  {
    id: "webhook_hmac_fail",
    category: "webhook_crypto",
    level: "medium",
    weight: 60,
    test: ({ text }) => {
      if (
        /webhook.*(signature|hmac|invalid|mismatch)|invalid (signature|hmac)|timing.?safe.?equal failed/i.test(
          text,
        )
      ) {
        return ["hmac-signature"];
      }
      return null;
    },
    title: "Webhook signature validation failed",
    risk: "Incoming webhook was rejected (or, worse, might be accepted without a valid signature). Forged events could mutate orders or balances.",
    why: "HMAC / signing-secret checks must be constant-time and mandatory on every webhook path.",
    where: "Edge functions / webhook handlers · Cloud → Secrets (signing keys)",
    fix: "1) Verify the signing secret matches the provider. 2) Reject on any mismatch. 3) Rotate secrets if leakage is suspected.",
    priorityAction: "Verify and enforce webhook HMAC",
  },

  {
    id: "ssrf_internal_target",
    category: "ssrf_path",
    level: "medium",
    weight: 62,
    test: ({ text, entities }) => {
      if (
        /ssrf|metadata\.google|169\.254\.|file:\/\/|internal.?address/i.test(
          text,
        ) ||
        entities.hosts.some((h) =>
          /^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.)/.test(h),
        )
      ) {
        return uniq([
          ...entities.hosts,
          ...extractAll(text, /169\.254\.\d+\.\d+/g),
        ]);
      }
      return null;
    },
    title: "Possible SSRF / internal-target signal",
    risk: "A request may have targeted loopback, link-local, or cloud metadata addresses. SSRF can expose instance credentials or internal services.",
    why: "User-controlled URLs passed to server-side fetch must be strictly allow-listed; private and metadata ranges must be blocked.",
    where: "Server-side fetch that accepts client URLs · image proxies · webhook relays",
    fix: "1) Allow-list schemes and hosts. 2) Block 169.254.0.0/16, 127.0.0.0/8, 10.0.0.0/8, 192.168.0.0/16. 3) Prefer fixed endpoints over arbitrary user URLs.",
    priorityAction: "Block private/metadata ranges in any URL fetch",
  },

  {
    id: "open_redirect",
    category: "open_redirect",
    level: "medium",
    weight: 56,
    test: ({ text }) => {
      if (
        /open.?redirect|invalid redirect|redirect_uri.*(mismatch|not allowed)|unsafe redirect/i.test(
          text,
        )
      ) {
        return ["redirect_uri"];
      }
      return null;
    },
    title: "Open-redirect / redirect_uri rejection",
    risk: "Auth or navigation flows rejected an unsafe redirect. If validation is missing on other paths, attackers can phish via trusted domains.",
    why: "OAuth redirect_uri and post-login return URLs must be strictly allow-listed to same-origin paths.",
    where: "Supabase Auth redirect allow-list · staff login returnTo · ?next= / ?redirect= handlers",
    fix: "1) Allow only known app origins. 2) Reject protocol-relative and external URLs. 3) Resolve relative paths against a fixed origin.",
    priorityAction: "Lock redirect targets to same-origin allow-list",
  },

  {
    id: "bulk_service_fees_missing",
    category: "lovable_supabase",
    level: "medium",
    weight: 64,
    test: ({ text }) => {
      if (/bulk_service_fees|fee_message|set_bulk_service_fee/i.test(text)) {
        return extractAll(
          text,
          /bulk_service_fees|fee_message|set_bulk_service_fee/gi,
        );
      }
      return null;
    },
    title: "Bulk / Fast Service fee table or column missing",
    risk: "Skippe set_bulk_service_fee requires public.bulk_service_fees (and often fee_message). Missing objects break chef tooling and generate schema-cache noise that consumes credits.",
    why: "Later migrations for bulk fees were never applied on this Lovable Cloud project.",
    where: "src/lib/skippe.server.ts → set_bulk_service_fee · supabase/migrations/*bulk*",
    fix: "1) Create public.bulk_service_fees + bulk_service_eligible_chefs from the fix migration. 2) ADD COLUMN fee_message if required. 3) NOTIFY pgrst, 'reload schema'; 4) Retry.",
    priorityAction: "Apply bulk_service_fees migration + reload cache",
    sqlHints: ["NOTIFY pgrst, 'reload schema';"],
  },

  {
    id: "data_integrity_constraint",
    category: "data_integrity",
    level: "medium",
    weight: 50,
    test: ({ text, entities }) => {
      if (
        /violates (unique|check|not-null|foreign key) constraint|duplicate key value|23505|23503|23514|23502/i.test(
          text,
        )
      ) {
        return uniq([
          ...entities.sqlstates.filter((s) =>
            ["23505", "23503", "23514", "23502"].includes(s),
          ),
          ...extractAll(
            text,
            /constraint ["']?([a-z0-9_]+)/gi,
          ),
        ]);
      }
      return null;
    },
    title: "Data integrity constraint violation",
    risk: "Insert/update violated a unique, check, not-null, or foreign-key constraint. Repeated failures can indicate race conditions or client bugs that waste write quota.",
    why: "Application logic did not pre-check uniqueness or required fields before writing.",
    where: "Relevant table constraints · INSERT/UPDATE paths in server functions",
    fix: "1) Read the constraint name from the error. 2) Pre-validate on the client/server. 3) Use ON CONFLICT where appropriate. 4) Avoid blind retries that re-hit the same constraint.",
    priorityAction: "Handle the named constraint before retrying writes",
  },

  /* ── LOW / INFO ───────────────────────────────────────────────────────── */

  {
    id: "staff_login_rejected",
    category: "auth_session",
    level: "low",
    weight: 38,
    test: ({ text }) => {
      if (
        /wrong username or password|invalid login credentials|invalid_credentials/i.test(
          text,
        )
      ) {
        return ["invalid_credentials"];
      }
      return null;
    },
    title: "Staff login credentials rejected",
    risk: "Failed staff authentication. Repeated failures can indicate credential stuffing; prefer strong unique passwords.",
    why: "Staff usernames map to email {normalized}@pandabites.local. Wrong password hash, unconfirmed email, or mismatched username all fail identically.",
    where: "src/routes/staff.tsx · staff-username helper · auth.users",
    fix: "1) Confirm email is username@pandabites.local in auth.users. 2) Reset password via SQL crypt() if the Cloud UI has no reset. 3) Ensure email_confirmed_at is set.",
    priorityAction: "Reset password for the target @pandabites.local user",
  },

  {
    id: "debug_stack_leak",
    category: "debug_leak",
    level: "low",
    weight: 32,
    test: ({ text }) => {
      if (
        (/stack trace|at Object\.|node_modules|webpack:\/\/|__dirname|ENOENT|ECONNREFUSED/i.test(
          text,
        ) &&
          /development|debug|local/i.test(text)) ||
        /\/home\/|\/Users\/|C:\\\\Users/i.test(text)
      ) {
        return ["stack-or-path"];
      }
      return null;
    },
    title: "Debug or filesystem detail leaked into client error",
    risk: "Verbose stacks or absolute paths help attackers map the deployment and library versions.",
    why: "Production should return generic messages; detailed stacks belong only in server-side logs.",
    where: "Error boundaries · reportLovableError · production build flags",
    fix: "1) Gate verbose stacks behind import.meta.env.DEV. 2) Send full detail only to server telemetry. 3) Strip absolute paths from client-facing messages.",
    priorityAction: "Hide detailed stacks in production builds",
  },

  {
    id: "jwt_alg_none_or_weak",
    category: "auth_session",
    level: "critical",
    weight: 92,
    test: ({ text, lower }) => {
      if (
        /\balg\b.*\bnone\b/i.test(text) ||
        /jwt.*(weak|insecure|invalid signature)/i.test(lower)
      ) {
        return ["jwt-integrity"];
      }
      return null;
    },
    title: "JWT integrity / algorithm risk",
    risk: "Token validation may accept weak or none algorithms, allowing identity spoofing.",
    why: "Error text references JWT algorithm or signature failures that often indicate misconfigured verification.",
    where: "Auth middleware / Supabase JWT verification path.",
    fix: "Verify tokens only via supabase.auth.getUser/getClaims; never authorize from client-side JWT decode alone.",
    priorityAction: "Force re-login after confirming server-side JWT verification.",
  },
  {
    id: "privilege_escalation_role",
    category: "authorization",
    level: "critical",
    weight: 90,
    test: ({ text, lower }) => {
      if (
        /\b(admin|service_role|bypass rls|security definer)\b/i.test(text) &&
        /\b(denied|forbidden|unauthorized|escalat)/i.test(lower)
      ) {
        return ["priv-escalation-language"];
      }
      return null;
    },
    title: "Possible privilege-escalation attempt or mis-role",
    risk: "A non-admin path may be probing admin RPCs or SECURITY DEFINER functions.",
    why: "Admin/service_role language combined with denied/unauthorized indicates an authorization boundary was hit.",
    where: "Staff role checks, RPC grants, or SECURITY DEFINER functions.",
    fix: "Confirm user_roles for the actor; never trust client-sent role claims.",
    priorityAction: "Check user_roles for the requesting user_id before changing policies.",
  },
  {
    id: "path_traversal",
    category: "ssrf_path",
    level: "high",
    weight: 84,
    test: ({ text, lower }) => {
      if (/\.\.\/|\.\.\\|%2e%2e/i.test(text) || /path traversal/i.test(lower)) {
        return ["path-traversal"];
      }
      return null;
    },
    title: "Path traversal signal",
    risk: "Request may try to read files outside the intended directory.",
    why: "Traversal sequences appeared in the error/context.",
    where: "File/storage path construction.",
    fix: "Resolve paths with a root allowlist; reject '..' segments.",
    priorityAction: "Block inputs containing '..' and review storage key builders.",
  },
  {
    id: "prototype_pollution",
    category: "injection",
    level: "high",
    weight: 86,
    test: ({ text }) => {
      if (/__proto__|constructor\s*\[|prototype pollution/i.test(text)) {
        return ["prototype-pollution"];
      }
      return null;
    },
    title: "Prototype pollution signal",
    risk: "Merging untrusted JSON can overwrite Object.prototype and bypass checks.",
    why: "Error/context references __proto__/constructor pollution patterns.",
    where: "Deep merge / Object.assign of request bodies.",
    fix: "Validate with zod; pick explicit fields; never merge raw JSON into prototypes.",
    priorityAction: "Locate Object.assign/merge on user input and switch to allowlisted fields.",
  },
  {
    id: "csrf_origin_mismatch",
    category: "cors_csp",
    level: "high",
    weight: 78,
    test: ({ lower }) => {
      if (/csrf|invalid origin|origin mismatch|same-site/i.test(lower)) {
        return ["csrf-origin"];
      }
      return null;
    },
    title: "CSRF / Origin mismatch",
    risk: "Cross-site requests may execute state-changing actions without origin checks.",
    why: "CSRF or origin-mismatch language appeared in the failure.",
    where: "Server actions / form POSTs.",
    fix: "Enforce SameSite cookies, Origin checks on mutating routes, and auth on every server fn.",
    priorityAction: "Confirm the failing request Origin matches your app host.",
  },
  {
    id: "supabase_anon_key_abuse",
    category: "lovable_supabase",
    level: "high",
    weight: 80,
    test: ({ lower }) => {
      if (
        (/anon|publishable/.test(lower) &&
          /key|apikey/.test(lower) &&
          /invalid|revoked|denied/.test(lower)) ||
        /invalid api key/.test(lower)
      ) {
        return ["supabase-api-key"];
      }
      return null;
    },
    title: "Supabase API key rejected",
    risk: "Wrong or revoked publishable key breaks data access; a leaked secret key is worse.",
    why: "Supabase rejected the API key presented by the client or server.",
    where: "Lovable Cloud secrets / createClient config.",
    fix: "Rotate keys; update SUPABASE_PUBLISHABLE_KEY; never ship service_role to the browser.",
    priorityAction: "Verify Cloud → Secrets matches the current Supabase project keys.",
  },
  {
    id: "skippe_gateway_auth",
    category: "lovable_supabase",
    level: "high",
    weight: 82,
    test: ({ text, lower }) => {
      if (
        /lovable_api_key|ai\.gateway\.lovable|skippe auth failed|credits exhausted/i.test(
          text,
        )
      ) {
        return ["skippe-gateway"];
      }
      return null;
    },
    title: "Skippe / Lovable AI gateway auth or credits",
    risk: "AI kitchen actions fail depending on key/credits.",
    why: "Gateway auth, LOVABLE_API_KEY, or credit exhaustion appears in the error.",
    where: "skippe.server.ts gatewayFetch / Lovable secrets.",
    fix: "Set valid LOVABLE_API_KEY; add credits if 402; do not hardcode keys.",
    priorityAction: "Check Lovable AI credits and LOVABLE_API_KEY secret.",
  },
  {
    id: "mass_assignment",
    category: "idor",
    level: "high",
    weight: 81,
    test: ({ text, lower }) => {
      if (
        /mass assignment|unexpected column|could not find the .* column/i.test(
          lower,
        ) && /\b(role|is_admin|owner_id|price_bs)\b/i.test(text)
      ) {
        return ["mass-assignment-surface"];
      }
      return null;
    },
    title: "Mass-assignment / unexpected column write",
    risk: "Clients may try to write privileged columns (role, owner_id, price).",
    why: "Schema rejected a column that often indicates a privileged field write attempt.",
    where: "Insert/update payloads from forms or Skippe tools.",
    fix: "Allowlist columns server-side; never spread req.body into inserts.",
    priorityAction: "Inspect the failing payload keys and strip privileged fields.",
  },

  {
    id: "tls_crypto_noise",

    category: "crypto_tls",
    level: "low",
    weight: 34,
    test: ({ text }) => {
      if (
        /ssl|tls|certificate|ERR_CERT|self signed|UNABLE_TO_VERIFY|wrong version number/i.test(
          text,
        )
      ) {
        return extractAll(
          text,
          /ERR_CERT\w*|self signed|UNABLE_TO_VERIFY/gi,
        );
      }
      return null;
    },
    title: "TLS / certificate problem",
    risk: "Encrypted channel could not be established or verified. Traffic may be intercepted or the endpoint may be misconfigured.",
    why: "Expired, self-signed, or hostname-mismatched certificates, or attempts to speak TLS to a plain HTTP port.",
    where: "Fetch targets · custom domains · local dev proxies",
    fix: "1) Verify the certificate chain and hostname. 2) Do not disable TLS verification in production. 3) Confirm the correct protocol (https) is used.",
    priorityAction: "Fix certificate or protocol mismatch",
  },
];

/* -------------------------------------------------------------------------- */
/*  Core diagnosis                                                            */
/* -------------------------------------------------------------------------- */

function buildContext(error: unknown): {
  text: string;
  lower: string;
  entities: ExtractedEntities;
} {
  let text =
    error instanceof Error
      ? `${error.name}: ${error.message}${
          error.stack ? `\n${error.stack}` : ""
        }`
      : typeof error === "string"
        ? error
        : error == null
          ? ""
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

  // Harden against extremely large payloads
  if (text.length > 12_000) {
    text = `${text.slice(0, 12_000)}…[truncated]`;
  }

  return {
    text,
    lower: text.toLowerCase(),
    entities: extractEntities(text),
  };
}

/**
 * Primary entry point. Returns null when the error does not look
 * security-relevant.
 */
export function diagnoseSecurityRisk(
  error: unknown,
): SecurityDiagnosis | null {
  const { text, lower, entities } = buildContext(error);
  if (!text || text.length < 3) return null;

  const hits: SignalHit[] = [];

  for (const rule of RULES) {
    const ctx: RuleContext = {
      text,
      lower,
      entities,
      evidence: [],
    };
    const evidence = rule.test(ctx);
    if (!evidence || evidence.length === 0) continue;

    ctx.evidence = evidence;
    hits.push({
      ruleId: rule.id,
      category: rule.category,
      level: rule.level,
      weight: rule.weight,
      evidence,
    });
  }

  if (hits.length === 0) return null;

  // Rank: level → weight → evidence count
  hits.sort((a, b) => {
    const ld = LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level];
    if (ld !== 0) return ld;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return b.evidence.length - a.evidence.length;
  });

  const topHit = hits[0];
  const topRule = RULES.find((r) => r.id === topHit.ruleId)!;
  const ctx: RuleContext = {
    text,
    lower,
    entities,
    evidence: topHit.evidence,
  };

  // Confidence: weight + evidence density + multi-signal bonus
  const categoryCount = new Set(hits.map((h) => h.category)).size;
  let confidence =
    0.42 +
    topHit.weight / 220 +
    Math.min(topHit.evidence.length, 5) * 0.07 +
    Math.min(categoryCount - 1, 3) * 0.05;
  confidence = Math.max(0.35, Math.min(0.98, confidence));

  // Severity bump when multiple independent families fire
  let level = topHit.level;
  if (categoryCount >= 3) {
    const idx = LEVEL_BUMP.indexOf(level);
    if (idx >= 0 && idx < LEVEL_BUMP.length - 1) {
      level = LEVEL_BUMP[idx + 1];
    }
  }

  const score = Math.round(
    Math.min(100, topHit.weight * confidence + categoryCount * 3),
  );

  const related = hits.slice(1, 5).map((h) => h.ruleId);

  const sqlHints = topRule.sqlHints
    ? resolve(topRule.sqlHints, ctx)
    : undefined;

  return {
    isSecurityRisk: true,
    level,
    category: topRule.category,
    title: resolve(topRule.title, ctx),
    risk: resolve(topRule.risk, ctx),
    why: resolve(topRule.why, ctx),
    where: resolve(topRule.where, ctx),
    fix: resolve(topRule.fix, ctx),
    message: text.length > 2500 ? `${text.slice(0, 2500)}…` : text,
    score,
    confidence: Math.round(confidence * 100) / 100,
    evidence: topHit.evidence,
    entities,
    signals: hits,
    related: related.length ? related : undefined,
    priorityAction: topRule.priorityAction
      ? resolve(topRule.priorityAction, ctx)
      : resolve(topRule.fix, ctx).split(/\. /)[0] + ".",
    sqlHints: sqlHints?.length ? sqlHints : undefined,
    playbook: [
      topRule.priorityAction
        ? resolve(topRule.priorityAction, ctx)
        : resolve(topRule.fix, ctx).split(/\. /)[0] + ".",
      resolve(topRule.fix, ctx),
      "Reproduce once with Network + Console open; save the failing URL and status.",
      "If user-sensitive, rotate sessions/keys before further debugging.",
    ],
    blastRadius:
      level === "critical"
        ? "Account takeover, data exfil, or privilege boundary failure is plausible for this class."
        : level === "high"
          ? "Unauthorized reads/writes or session abuse may be possible if the signal is confirmed."
          : "Limited or noisy signal — verify before treating as an incident.",
    hardening: [
      "Keep service_role and LOVABLE_API_KEY server-only.",
      "Prefer allowlisted server-fn inputs (zod) over open JSON spreads.",
      "Log security-relevant denials without storing secrets in client storage.",
    ],
  };
}


export function isSecurityRiskError(error: unknown): boolean {
  return diagnoseSecurityRisk(error)?.isSecurityRisk === true;
}

/** Plain-text block for “Copy error details”. */
export function formatSecurityDiagnosisForCopy(
  diagnosis: SecurityDiagnosis,
): string {
  const lines = [
    `[SECURITY ${diagnosis.level.toUpperCase()} · score ${diagnosis.score} · confidence ${diagnosis.confidence}]`,
    diagnosis.title,
    "",
    `Category: ${diagnosis.category}`,
    `Priority: ${diagnosis.priorityAction}`,
    diagnosis.blastRadius ? `Blast radius: ${diagnosis.blastRadius}` : "",
    ...(diagnosis.playbook?.length
      ? ["", "Playbook:", ...diagnosis.playbook.map((s, i) => `  ${i + 1}. ${s}`)]
      : []),
    ...(diagnosis.hardening?.length
      ? ["", "Hardening:", ...diagnosis.hardening.map((s) => `  • ${s}`)]
      : []),
    "",
    `Risk: ${diagnosis.risk}`,
    `Why: ${diagnosis.why}`,
    `Where: ${diagnosis.where}`,
    `Fix: ${diagnosis.fix}`,
  ];

  if (diagnosis.evidence.length) {
    lines.push("", "Evidence:");
    for (const e of diagnosis.evidence) lines.push(`  - ${e}`);
  }

  const ent = diagnosis.entities;
  const entLines: string[] = [];
  if (ent.tables.length) entLines.push(`tables: ${ent.tables.join(", ")}`);
  if (ent.functions.length)
    entLines.push(`functions: ${ent.functions.join(", ")}`);
  if (ent.pgrstCodes.length)
    entLines.push(`pgrst: ${ent.pgrstCodes.join(", ")}`);
  if (ent.sqlstates.length)
    entLines.push(`sqlstate: ${ent.sqlstates.join(", ")}`);
  if (ent.httpCodes.length)
    entLines.push(`http: ${ent.httpCodes.join(", ")}`);
  if (entLines.length) {
    lines.push("", "Extracted entities:", ...entLines.map((l) => `  ${l}`));
  }

  if (diagnosis.signals.length > 1) {
    lines.push(
      "",
      "All matched signals:",
      ...diagnosis.signals.map(
        (s) =>
          `  - [${s.level}] ${s.ruleId} (w=${s.weight}) ${s.evidence
            .slice(0, 3)
            .join(", ")}`,
      ),
    );
  }

  if (diagnosis.sqlHints?.length) {
    lines.push("", "Safe SQL hints (run manually in Cloud → SQL editor):");
    for (const q of diagnosis.sqlHints) lines.push(`  ${q}`);
  }

  if (diagnosis.related?.length) {
    lines.push("", `Related rules: ${diagnosis.related.join(", ")}`);
  }

  lines.push("", "Raw:", diagnosis.message);
  return lines.join("\n");
}

/**
 * Helper for soft / handled UIs (My Profile, Skippe toasts, etc.)
 * so they can show a compact security banner without crashing the route.
 */
export function securityBannerProps(error: unknown): {
  show: boolean;
  diagnosis: SecurityDiagnosis | null;
} {
  const diagnosis = diagnoseSecurityRisk(error);
  return { show: Boolean(diagnosis), diagnosis };
}

/**
 * Compact one-line summary for logs / telemetry tags.
 */
export function securitySummary(error: unknown): string | null {
  const d = diagnoseSecurityRisk(error);
  if (!d) return null;
  return `[${d.level}/${d.score}] ${d.category}: ${d.title}`;
}
