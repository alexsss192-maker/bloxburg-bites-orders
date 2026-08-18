/**
 * bug-detector.ts — detection engine (not a reason dictionary)
 *
 * Pure client-side. No DB. No fetch.
 *
 * How detection actually works:
 *   1. Structural feature extraction from the Error object (name, cause chain,
 *      stack shape, own keys, PostgREST shape, React minified codes, etc.)
 *   2. Token + entity extraction from message/stack
 *   3. Independent scorers (each returns 0–100 + evidence)
 *   4. Rank by score; compound bonus when multiple families fire
 *   5. Build diagnosis from the winning scorer
 *
 * Security is a first-class scorer (imports security-risk).
 */

import {
  diagnoseSecurityRisk,
  formatSecurityDiagnosisForCopy,
  type SecurityDiagnosis,
} from "./security-risk";

/* ──────────────────────────── types ──────────────────────────── */

export type BugLevel = "critical" | "high" | "medium" | "low" | "info";

export type BugFamily =
  | "security"
  | "postgrest"
  | "auth"
  | "react"
  | "hydration"
  | "network"
  | "tanstack"
  | "type_null"
  | "constraint"
  | "gateway"
  | "stack_overflow"
  | "unknown";

export type BugDiagnosis = {
  isBug: true;
  level: BugLevel;
  family: BugFamily;
  title: string;
  summary: string;
  why: string;
  where: string;
  fix: string;
  priorityAction: string;
  message: string;
  score: number;
  confidence: number;
  evidence: string[];
  features: ErrorFeatures;
  scorers: ScorerResult[];
  security: SecurityDiagnosis | null;
  isSecurityRelated: boolean;
  fingerprint: string;
  sqlHints?: string[];
};

/* ──────────────────────────── feature extraction ──────────────────────────── */

export type ErrorFeatures = {
  name: string;
  message: string;
  fullText: string;
  stack: string;
  stackDepth: number;
  appFrames: string[];
  libFrames: string[];
  minifiedFrames: string[];
  hasCause: boolean;
  causeNames: string[];
  ownKeys: string[];
  /** Supabase / PostgREST error shape */
  isPostgrestShape: boolean;
  pgCode: string | null;
  pgDetails: string | null;
  pgHint: string | null;
  httpStatus: number | null;
  isTypeError: boolean;
  isReferenceError: boolean;
  isSyntaxError: boolean;
  isAggregate: boolean;
  reactMinifiedCode: string | null;
  tokens: string[];
  tables: string[];
  functions: string[];
  sqlstates: string[];
  pgrstCodes: string[];
  uuids: string[];
  files: string[];
  components: string[];
  hooks: string[];
};

function safeStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./@-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 80);
}

function extractAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) out.push((m[1] ?? m[0]).trim());
  return [...new Set(out.filter(Boolean))];
}

function parseStack(stack: string): {
  depth: number;
  app: string[];
  lib: string[];
  minified: string[];
} {
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  const app: string[] = [];
  const lib: string[] = [];
  const minified: string[] = [];
  for (const line of lines) {
    if (/node_modules|webpack-internal|react-dom|scheduler|chunk/i.test(line)) {
      lib.push(line.slice(0, 180));
    } else if (/assets\/.+\.js:\d+|chunks\/.+\.js:\d+/i.test(line)) {
      minified.push(line.slice(0, 180));
    } else if (/src\/|routes\/|components\/|lib\//i.test(line)) {
      app.push(line.slice(0, 180));
    }
  }
  return { depth: lines.length, app, lib, minified };
}

function readOwnKeys(err: unknown): string[] {
  if (err == null || typeof err !== "object") return [];
  try {
    return Object.keys(err as object).slice(0, 30);
  } catch {
    return [];
  }
}

function readCauseChain(err: unknown): string[] {
  const names: string[] = [];
  let cur: unknown = err;
  let guard = 0;
  while (cur && typeof cur === "object" && guard++ < 6) {
    const c = (cur as { cause?: unknown }).cause;
    if (!c) break;
    names.push(c instanceof Error ? c.name : typeof c);
    cur = c;
  }
  return names;
}

/** Extract a numeric HTTP status if present on the object or in text. */
function readHttpStatus(err: unknown, text: string): number | null {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    for (const k of ["status", "statusCode", "status_code"]) {
      const v = o[k];
      if (typeof v === "number" && v >= 100 && v <= 599) return v;
      if (typeof v === "string" && /^\d{3}$/.test(v)) return Number(v);
    }
  }
  const m = text.match(/\b([45]\d{2})\b/);
  return m ? Number(m[1]) : null;
}

/** Detect Supabase PostgrestError-like shape. */
function readPostgrest(err: unknown): {
  shape: boolean;
  code: string | null;
  details: string | null;
  hint: string | null;
} {
  if (!err || typeof err !== "object") {
    return { shape: false, code: null, details: null, hint: null };
  }
  const o = err as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : null;
  const details = typeof o.details === "string" ? o.details : null;
  const hint = typeof o.hint === "string" ? o.hint : null;
  const msg = typeof o.message === "string" ? o.message : "";
  const shape = Boolean(
    code ||
      details ||
      hint ||
      /PGRST\d{3}|22P02|23503|23505|42501|42P01/i.test(msg + (code ?? "")),
  );
  return { shape, code, details, hint };
}

export function extractFeatures(error: unknown): ErrorFeatures {
  const name =
    error instanceof Error
      ? error.name || "Error"
      : error && typeof error === "object" && "name" in error
        ? String((error as { name: unknown }).name)
        : "Error";

  const message =
    error instanceof Error
      ? error.message || ""
      : typeof error === "string"
        ? error
        : safeStr(error);

  const stack = error instanceof Error && error.stack ? error.stack : "";
  const fullText = `${name}: ${message}\n${stack}`.slice(0, 16000);
  const parsed = parseStack(stack);
  const pg = readPostgrest(error);
  const reactMini = message.match(/minified react error #(\d+)/i);

  return {
    name,
    message,
    fullText,
    stack,
    stackDepth: parsed.depth,
    appFrames: parsed.app,
    libFrames: parsed.lib,
    minifiedFrames: parsed.minified,
    hasCause: readCauseChain(error).length > 0,
    causeNames: readCauseChain(error),
    ownKeys: readOwnKeys(error),
    isPostgrestShape: pg.shape,
    pgCode: pg.code,
    pgDetails: pg.details,
    pgHint: pg.hint,
    httpStatus: readHttpStatus(error, fullText),
    isTypeError: name === "TypeError" || /typeerror/i.test(name),
    isReferenceError: name === "ReferenceError",
    isSyntaxError: name === "SyntaxError",
    isAggregate: name === "AggregateError",
    reactMinifiedCode: reactMini?.[1] ?? null,
    tokens: extractTokens(fullText),
    tables: extractAll(
      fullText,
      /(?:table|relation|from|into|update)\s+["']?(?:public\.)?([a-z][a-z0-9_]*)/gi,
    ).concat(extractAll(fullText, /public\.([a-z][a-z0-9_]*)/gi)),
    functions: extractAll(
      fullText,
      /function\s+["']?(?:public\.)?([a-z][a-z0-9_]*)/gi,
    ).concat(extractAll(fullText, /public\.([a-z][a-z0-9_]*)\s*\(/gi)),
    sqlstates: extractAll(fullText, /\b([0-9A-Z]{5})\b/g).filter((c) =>
      /^(22|23|28|42|P0)/.test(c),
    ),
    pgrstCodes: extractAll(fullText, /\b(PGRST\d{3})\b/gi),
    uuids: extractAll(
      fullText,
      /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi,
    ),
    files: extractAll(
      fullText,
      /((?:src|app|routes|components|lib)\/[a-zA-Z0-9_./\-]+\.(?:tsx?|jsx?))/g,
    ),
    components: extractAll(
      fullText,
      /(?:at|in)\s+([A-Z][A-Za-z0-9_]+)\s*(?:\(|—|-)/g,
    ),
    hooks: extractAll(fullText, /\b(use[A-Z][A-Za-z0-9_]*)\b/g),
  };
}

/** Stable fingerprint for de-dupe / telemetry (not cryptographic). */
export function fingerprintError(f: ErrorFeatures): string {
  const core = [
    f.name,
    f.pgCode ?? "",
    f.pgrstCodes[0] ?? "",
    f.sqlstates[0] ?? "",
    f.reactMinifiedCode ?? "",
    f.tables[0] ?? "",
    f.functions[0] ?? "",
    f.message.slice(0, 80).toLowerCase().replace(/\d+/g, "#"),
  ].join("|");
  let h = 0;
  for (let i = 0; i < core.length; i++) {
    h = (Math.imul(31, h) + core.charCodeAt(i)) | 0;
  }
  return `e_${(h >>> 0).toString(16)}`;
}

/* ──────────────────────────── scorers ──────────────────────────── */

type ScorerResult = {
  family: BugFamily;
  level: BugLevel;
  score: number; // 0–100
  evidence: string[];
  title: string;
  summary: string;
  why: string;
  where: string;
  fix: string;
  priorityAction: string;
  sqlHints?: string[];
};

type Scorer = (f: ErrorFeatures) => ScorerResult | null;

const has = (f: ErrorFeatures, ...needles: string[]) => {
  const t = f.fullText.toLowerCase();
  return needles.some((n) => t.includes(n.toLowerCase()));
};

const tokenHas = (f: ErrorFeatures, ...needles: string[]) =>
  needles.some((n) => f.tokens.includes(n.toLowerCase()));

/* --- individual scorers (detection logic lives here) --- */

const scorePostgrest: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];

  if (f.isPostgrestShape) {
    score += 35;
    evidence.push("postgrest-error-shape");
  }
  if (f.pgCode) {
    score += 25;
    evidence.push(`code:${f.pgCode}`);
  }
  if (f.pgrstCodes.length) {
    score += 30;
    evidence.push(...f.pgrstCodes);
  }
  if (f.sqlstates.length) {
    score += 20;
    evidence.push(...f.sqlstates.map((s) => `sqlstate:${s}`));
  }
  if (has(f, "schema cache", "could not find the table", "could not find the function")) {
    score += 40;
    evidence.push("schema-cache-phrase");
  }
  if (has(f, "row-level security", "42501", "permission denied for")) {
    score += 35;
    evidence.push("rls-phrase");
  }
  if (f.tables.length) {
    score += 10;
    evidence.push(...f.tables.map((t) => `table:${t}`));
  }
  if (f.functions.length) {
    score += 10;
    evidence.push(...f.functions.map((fn) => `fn:${fn}`));
  }

  if (score < 25) return null;

  const isSchema = has(f, "schema cache") || f.pgrstCodes.some((c) => /204|202|205|116/.test(c));
  const isRls = has(f, "row-level", "42501", "permission denied");
  const target = f.tables[0] || f.functions[0] || f.pgCode || "object";

  return {
    family: "postgrest",
    level: isRls || isSchema ? "high" : score >= 60 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    title: isSchema
      ? `Schema cache miss: ${target}`
      : isRls
        ? `RLS / permission denied (${target})`
        : `PostgREST error (${target})`,
    summary: isSchema
      ? "PostgREST does not expose this table/function/column."
      : isRls
        ? "Postgres RLS or grants blocked the query."
        : "Supabase/PostgREST returned a structured error.",
    why: isSchema
      ? "Migration not applied on live DB, or schema cache not reloaded."
      : isRls
        ? "No matching policy for this role/command, or missing GRANT."
        : f.pgDetails || f.pgHint || "PostgREST error payload.",
    where: `public.${target} · Cloud → SQL editor · pg_policies`,
    fix: isSchema
      ? `Create/alter ${target}, GRANT privileges, then NOTIFY pgrst, 'reload schema';`
      : isRls
        ? `Inspect pg_policies for ${target}, fix policy/role, reload schema.`
        : "Read code/details/hint on the error object and fix the underlying constraint or query.",
    priorityAction: isSchema
      ? "Apply migration + NOTIFY pgrst, 'reload schema'"
      : isRls
        ? "Fix RLS policy for the named object"
        : "Inspect PostgREST code/details/hint",
    sqlHints: isSchema || isRls ? ["NOTIFY pgrst, 'reload schema';"] : undefined,
  };
};

const scoreAuth: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (f.httpStatus === 401 || f.httpStatus === 403) {
    score += 40;
    evidence.push(`http:${f.httpStatus}`);
  }
  if (has(f, "invalid login", "invalid_credentials", "wrong username or password")) {
    score += 45;
    evidence.push("login-reject");
  }
  if (has(f, "jwt expired", "invalid jwt", "invalid token", "session expired", "not authenticated")) {
    score += 40;
    evidence.push("jwt-session");
  }
  if (has(f, "forbidden", "admin only", "staff only", "insufficient privilege")) {
    score += 35;
    evidence.push("rbac");
  }
  if (tokenHas(f, "unauthorized", "forbidden")) score += 15;

  if (score < 30) return null;

  return {
    family: "auth",
    level: score >= 55 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    title: "Auth / session / RBAC failure",
    summary: "Login, JWT, session, or role check failed.",
    why: "Bad credentials, expired session, missing user_roles, or admin-only path.",
    where: "staff login · auth middleware · user_roles · auth.users",
    fix: "Confirm @pandabites.local email, reset password if needed, ensure user_roles + email_confirmed_at.",
    priorityAction: "Verify session + user_roles for this account",
  };
};

const scoreReact: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];

  if (f.reactMinifiedCode) {
    score += 50;
    evidence.push(`react-minified#${f.reactMinifiedCode}`);
  }
  if (has(f, "invalid hook call", "rendered fewer hooks", "hooks can only be called")) {
    score += 55;
    evidence.push("rules-of-hooks");
  }
  if (has(f, "objects are not valid as a react child", "react.child")) {
    score += 45;
    evidence.push("invalid-child");
  }
  if (f.isTypeError && has(f, "cannot read propert", "undefined is not an object", "null is not an object")) {
    score += 35;
    evidence.push("null-property");
  }
  if (f.components.length) {
    score += 10;
    evidence.push(...f.components.slice(0, 3).map((c) => `component:${c}`));
  }
  if (f.hooks.length) {
    score += 8;
    evidence.push(...f.hooks.slice(0, 3).map((h) => `hook:${h}`));
  }
  if (f.libFrames.some((l) => /react-dom|scheduler/i.test(l))) {
    score += 12;
    evidence.push("react-dom-frame");
  }

  if (score < 30) return null;

  const where =
    f.appFrames[0] ||
    f.files[0] ||
    f.components[0] ||
    "component tree";

  return {
    family: "react",
    level: score >= 55 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    title: f.components[0]
      ? `React crash near ${f.components[0]}`
      : "React render / hooks crash",
    summary: "Component threw while rendering or violated the Rules of Hooks.",
    why: "Null access, hook order, invalid child, or minified React invariant.",
    where,
    fix: "Resolve sourcemap frame, guard nulls, keep hooks top-level and stable order, do not render raw objects.",
    priorityAction: "Open likely source frame and guard the failing access",
  };
};

const scoreHydration: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (has(f, "hydration", "text content does not match", "did not match server", "server html", "expected server html")) {
    score += 60;
    evidence.push("hydration-phrase");
  }
  if (has(f, "client-side exception while loading")) {
    score += 25;
    evidence.push("client-exception-loading");
  }
  if (score < 40) return null;
  return {
    family: "hydration",
    level: "high",
    score: Math.min(100, score),
    evidence,
    title: "React hydration mismatch",
    summary: "Server HTML did not match the client’s first render.",
    why: "Non-deterministic SSR (Date, random, window, auth-branching).",
    where: f.files[0] || f.components[0] || "SSR/client boundary",
    fix: "Move browser-only work to useEffect; keep first client render identical to server HTML.",
    priorityAction: "Remove non-deterministic SSR output",
  };
};

const scoreNetwork: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (has(f, "failed to fetch", "networkerror", "net::", "load failed", "econnrefused", "etimedout", "err_connection")) {
    score += 45;
    evidence.push("network-failure");
  }
  if (has(f, "cors", "access-control-allow-origin", "blocked by cors")) {
    score += 40;
    evidence.push("cors");
  }
  if (f.httpStatus && f.httpStatus >= 400) {
    score += 30;
    evidence.push(`http:${f.httpStatus}`);
  }
  if (score < 30) return null;
  return {
    family: "network",
    level: f.httpStatus && f.httpStatus >= 500 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    title: f.httpStatus ? `HTTP ${f.httpStatus} / network failure` : "Network or CORS failure",
    summary: "Fetch did not complete or upstream returned an error status.",
    why: "Offline, CORS, wrong origin, upstream down, or 4xx/5xx.",
    where: "fetch / Supabase client · gateway · CORS config",
    fix: "Inspect Network panel, fix CORS allow-list, handle 4xx, backoff on 5xx/429.",
    priorityAction: "Inspect the failing request in Network panel",
  };
};

const scoreTanstack: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (has(f, "usequery", "usesuspensequery", "queryclient", "react-query", "@tanstack/react-query")) {
    score += 40;
    evidence.push("query-api");
  }
  if (has(f, "createroute", "routetree", "@tanstack/react-router", "search params", "path params")) {
    score += 35;
    evidence.push("router-api");
  }
  if (has(f, "query failed", "loader failed", "notfoundcomponent")) {
    score += 25;
    evidence.push("query-or-loader-fail");
  }
  if (score < 35) return null;
  return {
    family: "tanstack",
    level: "medium",
    score: Math.min(100, score),
    evidence,
    title: "TanStack Query / Router failure",
    summary: "Query, mutation, loader, or route param handling threw.",
    why: "Rejected queryFn, missing suspense boundary, bad params, or aggressive refetch.",
    where: f.files[0] || "useQuery / route loader",
    fix: "Inspect queryFn error, validate params, raise staleTime, cap retries.",
    priorityAction: "Inspect failed queryFn / loader",
  };
};

const scoreTypeNull: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (f.isTypeError) {
    score += 25;
    evidence.push("TypeError");
  }
  if (f.isReferenceError) {
    score += 30;
    evidence.push("ReferenceError");
  }
  const prop = f.message.match(
    /cannot read propert(?:y|ies) ['"]?([a-z0-9_]+)['"]? of (undefined|null)/i,
  );
  if (prop) {
    score += 40;
    evidence.push(`prop:${prop[1]}`, `of:${prop[2]}`);
  }
  if (has(f, "is not a function", "is not defined", "undefined is not")) {
    score += 30;
    evidence.push("not-a-function-or-defined");
  }
  if (score < 35) return null;
  return {
    family: "type_null",
    level: "medium",
    score: Math.min(100, score),
    evidence,
    title: prop ? `Null/undefined access (.${prop[1]})` : "Type / Reference error",
    summary: "Runtime read/call on null, undefined, or missing binding.",
    why: "Optional data not ready, wrong shape, or missing import.",
    where: f.appFrames[0] || f.files[0] || f.components[0] || "runtime",
    fix: "Optional chaining, early returns, align types with runtime data.",
    priorityAction: "Guard the failing property/call",
  };
};

const scoreConstraint: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (f.sqlstates.some((s) => ["23505", "23503", "23514", "23502"].includes(s))) {
    score += 45;
    evidence.push(...f.sqlstates.map((s) => `sqlstate:${s}`));
  }
  if (has(f, "violates foreign key", "violates unique", "duplicate key", "violates check", "violates not-null")) {
    score += 40;
    evidence.push("constraint-phrase");
  }
  if (has(f, "is not present in table", "user_id_fkey")) {
    score += 35;
    evidence.push("fk-missing-parent");
  }
  if (score < 35) return null;
  return {
    family: "constraint",
    level: "medium",
    score: Math.min(100, score),
    evidence,
    title: "Database constraint violation",
    summary: "INSERT/UPDATE hit unique, FK, check, or not-null.",
    why: "Missing parent row, duplicate key, or invalid value.",
    where: f.tables[0] ? `public.${f.tables[0]}` : "table constraint",
    fix: "Pre-validate, use real auth.users ids for FKs, ON CONFLICT where appropriate.",
    priorityAction: "Fix the named constraint before retrying writes",
    sqlHints: ["SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 20;"],
  };
};

const scoreGateway: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (has(f, "skippe", "lovable_api_key", "model is not supported", "/v1/responses", "/v1/chat/completions")) {
    score += 45;
    evidence.push("gateway-phrase");
  }
  if (has(f, "openai", "gemini", "anthropic") && has(f, "error", "fail", "401", "429")) {
    score += 25;
    evidence.push("model-vendor");
  }
  if (score < 40) return null;
  return {
    family: "gateway",
    level: "medium",
    score: Math.min(100, score),
    evidence,
    title: "AI / Skippe gateway failure",
    summary: "External model or Skippe gateway call failed.",
    why: "Missing key, wrong vendor endpoint, or upstream rate limit.",
    where: "skippe.server.ts · Cloud → Secrets",
    fix: "Verify LOVABLE_API_KEY, correct /v1 path per vendor, backoff on 429.",
    priorityAction: "Check gateway key + endpoint path",
  };
};

const scoreStackOverflow: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (has(f, "maximum call stack", "too much recursion", "rangeerror")) {
    score += 55;
    evidence.push("stack-overflow");
  }
  if (f.stackDepth > 80) {
    score += 20;
    evidence.push(`depth:${f.stackDepth}`);
  }
  if (score < 50) return null;
  return {
    family: "stack_overflow",
    level: "high",
    score: Math.min(100, score),
    evidence,
    title: "Stack overflow / excessive recursion",
    summary: "Call stack exceeded limits.",
    why: "Infinite recursion or pathological mutual calls.",
    where: f.appFrames[0] || f.files[0] || "recursive path",
    fix: "Find missing base case; break cycle; avoid recursive render paths.",
    priorityAction: "Break the recursive path",
  };
};

const ALL_SCORERS: Scorer[] = [
  scorePostgrest,
  scoreAuth,
  scoreReact,
  scoreHydration,
  scoreNetwork,
  scoreTanstack,
  scoreTypeNull,
  scoreConstraint,
  scoreGateway,
  scoreStackOverflow,
];

/* ──────────────────────────── main API ──────────────────────────── */

export function diagnoseBug(error: unknown): BugDiagnosis | null {
  if (error == null) return null;

  const features = extractFeatures(error);
  const security = diagnoseSecurityRisk(error);
  const scorerResults: ScorerResult[] = [];

  for (const scorer of ALL_SCORERS) {
    try {
      const r = scorer(features);
      if (r && r.score >= 25) scorerResults.push(r);
    } catch {
      /* scorer must never throw */
    }
  }

  scorerResults.sort((a, b) => b.score - a.score);

  // Security critical/high wins primary slot
  if (security && (security.level === "critical" || security.level === "high")) {
    return {
      isBug: true,
      level: security.level,
      family: "security",
      title: security.title,
      summary: security.risk,
      why: security.why,
      where: security.where,
      fix: security.fix,
      priorityAction: security.priorityAction,
      message: security.message,
      score: security.score,
      confidence: security.confidence,
      evidence: security.evidence,
      features,
      scorers: scorerResults,
      security,
      isSecurityRelated: true,
      fingerprint: fingerprintError(features),
      sqlHints: security.sqlHints,
    };
  }

  if (scorerResults.length === 0 && !security) {
    // Unknown — still return a minimal diagnosis so UI can show something
    if (features.message.length < 2 && features.stackDepth === 0) return null;
    return {
      isBug: true,
      level: "low",
      family: "unknown",
      title: `${features.name}: unclassified`,
      summary: "No scorer reached confidence threshold.",
      why: "New failure mode or truncated message.",
      where: features.appFrames[0] || features.files[0] || "unknown",
      fix: "Copy stack, resolve sourcemap, reproduce with logging.",
      priorityAction: "Copy full stack and resolve top frame",
      message: features.fullText.slice(0, 2500),
      score: 15,
      confidence: 0.25,
      evidence: [features.name],
      features,
      scorers: [],
      security,
      isSecurityRelated: Boolean(security),
      fingerprint: fingerprintError(features),
    };
  }

  const top = scorerResults[0] ?? null;
  const familyCount = new Set(scorerResults.map((s) => s.family)).size;

  // Confidence from top score + agreement across scorers
  let confidence = Math.min(0.97, 0.35 + (top?.score ?? 0) / 150 + Math.min(familyCount, 3) * 0.06);
  if (security) confidence = Math.min(0.98, confidence + 0.04);

  let level: BugLevel = top?.level ?? "low";
  if (familyCount >= 3 && level !== "critical") {
    const order: BugLevel[] = ["info", "low", "medium", "high", "critical"];
    const i = order.indexOf(level);
    if (i >= 0 && i < order.length - 1) level = order[i + 1];
  }

  const score = Math.min(
    100,
    Math.round((top?.score ?? 20) * confidence + familyCount * 3),
  );

  // If security exists but wasn't critical/high, attach it
  if (!top) {
    return null;
  }

  return {
    isBug: true,
    level,
    family: top.family,
    title: top.title,
    summary: top.summary,
    why: top.why,
    where: top.where,
    fix: top.fix,
    priorityAction: top.priorityAction,
    message: features.fullText.slice(0, 2500),
    score,
    confidence: Math.round(confidence * 100) / 100,
    evidence: top.evidence,
    features,
    scorers: scorerResults,
    security,
    isSecurityRelated: Boolean(security),
    fingerprint: fingerprintError(features),
    sqlHints: top.sqlHints,
  };
}

export function isBugError(error: unknown): boolean {
  return diagnoseBug(error)?.isBug === true;
}

export function formatBugDiagnosisForCopy(d: BugDiagnosis): string {
  const lines = [
    `[BUG ${d.level.toUpperCase()} · ${d.family} · score ${d.score} · conf ${d.confidence} · fp ${d.fingerprint}]`,
    d.title,
    "",
    `Priority: ${d.priorityAction}`,
    `Summary: ${d.summary}`,
    `Why: ${d.why}`,
    `Where: ${d.where}`,
    `Fix: ${d.fix}`,
    "",
    "Detection evidence:",
    ...d.evidence.map((e) => `  - ${e}`),
  ];

  if (d.scorers.length > 1) {
    lines.push("", "All scorers:");
    for (const s of d.scorers) {
      lines.push(`  - [${s.level}/${s.score}] ${s.family}: ${s.title}`);
    }
  }

  const f = d.features;
  lines.push(
    "",
    "Features:",
    `  name=${f.name} postgrest=${f.isPostgrestShape} http=${f.httpStatus ?? "-"} stackDepth=${f.stackDepth}`,
    `  tables=${f.tables.join(",") || "-"} fns=${f.functions.join(",") || "-"}`,
    `  pgrst=${f.pgrstCodes.join(",") || "-"} sqlstate=${f.sqlstates.join(",") || "-"}`,
  );

  if (d.sqlHints?.length) {
    lines.push("", "SQL hints:", ...d.sqlHints.map((q) => `  ${q}`));
  }

  if (d.security) {
    lines.push("", "── Security ──", formatSecurityDiagnosisForCopy(d.security));
  }

  lines.push("", "Raw:", d.message);
  return lines.join("\n");
}

export function bugSummary(error: unknown): string | null {
  const d = diagnoseBug(error);
  return d ? `[${d.level}/${d.score}/${d.family}] ${d.title}` : null;
}

export function bugBannerProps(error: unknown): {
  show: boolean;
  diagnosis: BugDiagnosis | null;
} {
  const diagnosis = diagnoseBug(error);
  return { show: Boolean(diagnosis), diagnosis };
}
