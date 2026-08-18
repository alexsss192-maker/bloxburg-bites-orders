/**
 * bug-detector.ts — confirmed-cause engine (zero DB)
 *
 * Pipeline:
 *  1. Feature extraction (Error object, stack, PostgREST shape, tokens)
 *  2. Scorers (0–100 each)
 *  3. Confirmed-cause synthesizer → ONE primary why + ONE primary fix
 *  4. Ranked diagnosis for UI
 */

import {
  diagnoseSecurityRisk,
  formatSecurityDiagnosisForCopy,
  type SecurityDiagnosis,
} from "./security-risk";

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

export type ConfirmedCause = {
  /** Single sentence — the locked-in root cause */
  statement: string;
  /** Concrete next step */
  fix: string;
  /** Where in app code if known */
  location: string | null;
  /** Property / code / table that proved it */
  anchor: string | null;
  confidence: number;
};

export type BugDiagnosis = {
  isBug: true;
  level: BugLevel;
  family: BugFamily;
  title: string;
  /** Confirmed single cause (use this in UI, not laundry lists) */
  confirmed: ConfirmedCause;
  summary: string;
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

export type ErrorFeatures = {
  name: string;
  message: string;
  fullText: string;
  stack: string;
  stackDepth: number;
  appFrames: string[];
  libFrames: string[];
  minifiedFrames: string[];
  /** Best guess at app file:line from stack */
  primaryAppFrame: string | null;
  primaryFile: string | null;
  primaryLine: number | null;
  hasCause: boolean;
  causeNames: string[];
  ownKeys: string[];
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
  /** e.g. "volume" from "reading 'volume'" */
  nullProp: string | null;
  nullBase: "null" | "undefined" | null;
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

type ScorerResult = {
  family: BugFamily;
  level: BugLevel;
  score: number;
  evidence: string[];
  titleHint: string;
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

function extractAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const g = new RegExp(
    re.source,
    re.flags.includes("g") ? re.flags : re.flags + "g",
  );
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) out.push((m[1] ?? m[0]).trim());
  return [...new Set(out.filter(Boolean))];
}

function parseStack(stack: string): {
  depth: number;
  app: string[];
  lib: string[];
  minified: string[];
  primaryApp: string | null;
  primaryFile: string | null;
  primaryLine: number | null;
} {
  const lines = stack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const app: string[] = [];
  const lib: string[] = [];
  const minified: string[] = [];
  let primaryApp: string | null = null;
  let primaryFile: string | null = null;
  let primaryLine: number | null = null;

  for (const line of lines) {
    if (/node_modules|react-dom|scheduler|webpack-internal/i.test(line)) {
      lib.push(line.slice(0, 200));
      continue;
    }
    if (/assets\/.+\.js:\d+|chunks\/.+\.js:\d+/i.test(line)) {
      minified.push(line.slice(0, 200));
    }
    // Prefer real src paths
    const src =
      line.match(
        /((?:src|app|routes|components|lib)\/[a-zA-Z0-9_./\-]+\.(?:tsx?|jsx?)):(\d+)(?::(\d+))?/,
      ) ||
      line.match(
        /((?:\.\.\/)+src\/[a-zA-Z0-9_./\-]+\.(?:tsx?|jsx?)):(\d+)/,
      );
    if (src) {
      app.push(line.slice(0, 220));
      if (!primaryApp) {
        primaryApp = line.slice(0, 220);
        primaryFile = src[1].replace(/^(\.\.\/)+/, "");
        primaryLine = Number(src[2]);
      }
    }
  }
  return {
    depth: lines.length,
    app,
    lib,
    minified,
    primaryApp,
    primaryFile,
    primaryLine,
  };
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

function parseNullAccess(message: string): {
  prop: string | null;
  base: "null" | "undefined" | null;
} {
  const m = message.match(
    /cannot read propert(?:y|ies) ['"]?([a-zA-Z0-9_$]+)['"]? of (null|undefined)/i,
  );
  if (m) {
    return { prop: m[1], base: m[2].toLowerCase() as "null" | "undefined" };
  }
  return { prop: null, base: null };
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
  const nullAccess = parseNullAccess(message);

  return {
    name,
    message,
    fullText,
    stack,
    stackDepth: parsed.depth,
    appFrames: parsed.app,
    libFrames: parsed.lib,
    minifiedFrames: parsed.minified,
    primaryAppFrame: parsed.primaryApp,
    primaryFile: parsed.primaryFile,
    primaryLine: parsed.primaryLine,
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
    nullProp: nullAccess.prop,
    nullBase: nullAccess.base,
    tokens: fullText
      .toLowerCase()
      .replace(/[^a-z0-9_./@-]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 80),
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

export function fingerprintError(f: ErrorFeatures): string {
  const core = [
    f.name,
    f.nullProp ?? "",
    f.pgCode ?? "",
    f.pgrstCodes[0] ?? "",
    f.primaryFile ?? "",
    String(f.primaryLine ?? ""),
    f.message.slice(0, 60).toLowerCase().replace(/\d+/g, "#"),
  ].join("|");
  let h = 0;
  for (let i = 0; i < core.length; i++) {
    h = (Math.imul(31, h) + core.charCodeAt(i)) | 0;
  }
  return `e_${(h >>> 0).toString(16)}`;
}

const has = (f: ErrorFeatures, ...needles: string[]) => {
  const t = f.fullText.toLowerCase();
  return needles.some((n) => t.includes(n.toLowerCase()));
};

/* ── scorers (scores only; text comes from synthesizer) ── */

type Scorer = (f: ErrorFeatures) => ScorerResult | null;

const scoreNullAccess: Scorer = (f) => {
  if (!f.nullProp && !(f.isTypeError && has(f, "cannot read propert"))) {
    return null;
  }
  const evidence = ["null-property"];
  if (f.nullProp) evidence.push(`prop:${f.nullProp}`);
  if (f.nullBase) evidence.push(`of:${f.nullBase}`);
  if (f.primaryFile) evidence.push(`file:${f.primaryFile}`);
  if (f.primaryLine != null) evidence.push(`line:${f.primaryLine}`);
  return {
    family: "type_null",
    level: "medium",
    score: f.nullProp && f.primaryFile ? 92 : f.nullProp ? 78 : 55,
    evidence,
    titleHint: f.nullProp
      ? `Null access: reading '${f.nullProp}'`
      : "Null/undefined property access",
  };
};

const scorePostgrest: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (f.isPostgrestShape) {
    score += 30;
    evidence.push("postgrest-shape");
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
    evidence.push("schema-cache");
  }
  if (has(f, "row-level security", "42501", "permission denied for")) {
    score += 35;
    evidence.push("rls");
  }
  if (f.tables[0]) evidence.push(`table:${f.tables[0]}`);
  if (f.functions[0]) evidence.push(`fn:${f.functions[0]}`);
  if (score < 30) return null;
  return {
    family: "postgrest",
    level: score >= 60 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    titleHint: f.tables[0] || f.functions[0] || f.pgCode || "PostgREST error",
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
  if (has(f, "jwt expired", "invalid jwt", "session expired", "not authenticated")) {
    score += 40;
    evidence.push("jwt-session");
  }
  if (score < 35) return null;
  return {
    family: "auth",
    level: score >= 55 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    titleHint: "Auth / session failure",
  };
};

const scoreHydration: Scorer = (f) => {
  if (
    !has(
      f,
      "hydration",
      "text content does not match",
      "did not match server",
      "expected server html",
    )
  ) {
    return null;
  }
  return {
    family: "hydration",
    level: "high",
    score: 88,
    evidence: ["hydration-mismatch"],
    titleHint: "React hydration mismatch",
  };
};

const scoreHooks: Scorer = (f) => {
  if (
    !has(
      f,
      "invalid hook call",
      "rendered fewer hooks",
      "hooks can only be called",
      "change in the order of hooks",
    )
  ) {
    return null;
  }
  return {
    family: "react",
    level: "high",
    score: 90,
    evidence: ["rules-of-hooks"],
    titleHint: "Rules of Hooks violation",
  };
};

const scoreNetwork: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (has(f, "failed to fetch", "networkerror", "econnrefused", "err_connection")) {
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
  if (score < 35) return null;
  return {
    family: "network",
    level: f.httpStatus && f.httpStatus >= 500 ? "high" : "medium",
    score: Math.min(100, score),
    evidence,
    titleHint: f.httpStatus ? `HTTP ${f.httpStatus}` : "Network failure",
  };
};

const scoreConstraint: Scorer = (f) => {
  let score = 0;
  const evidence: string[] = [];
  if (f.sqlstates.some((s) => ["23505", "23503", "23514", "23502"].includes(s))) {
    score += 45;
    evidence.push(...f.sqlstates.map((s) => `sqlstate:${s}`));
  }
  if (has(f, "violates foreign key", "violates unique", "duplicate key", "user_id_fkey")) {
    score += 40;
    evidence.push("constraint");
  }
  if (score < 35) return null;
  return {
    family: "constraint",
    level: "medium",
    score: Math.min(100, score),
    evidence,
    titleHint: "Database constraint violation",
  };
};

const scoreGateway: Scorer = (f) => {
  if (
    !has(
      f,
      "skippe",
      "lovable_api_key",
      "model is not supported",
      "/v1/responses",
      "/v1/chat/completions",
    )
  ) {
    return null;
  }
  return {
    family: "gateway",
    level: "medium",
    score: 70,
    evidence: ["gateway"],
    titleHint: "AI / Skippe gateway failure",
  };
};

const scoreStackOverflow: Scorer = (f) => {
  if (!has(f, "maximum call stack", "too much recursion") && f.stackDepth < 80) {
    return null;
  }
  return {
    family: "stack_overflow",
    level: "high",
    score: 85,
    evidence: ["stack-overflow"],
    titleHint: "Stack overflow / recursion",
  };
};

const ALL_SCORERS: Scorer[] = [
  scoreNullAccess,
  scorePostgrest,
  scoreAuth,
  scoreHydration,
  scoreHooks,
  scoreNetwork,
  scoreConstraint,
  scoreGateway,
  scoreStackOverflow,
];

/* ── ONE confirmed cause (this is the important part) ── */

function synthesizeConfirmed(
  f: ErrorFeatures,
  top: ScorerResult | null,
  security: SecurityDiagnosis | null,
): ConfirmedCause {
  const loc =
    f.primaryFile && f.primaryLine != null
      ? `${f.primaryFile}:${f.primaryLine}`
      : f.primaryFile || f.appFrames[0] || null;

  // Security wins when critical/high
  if (security && (security.level === "critical" || security.level === "high")) {
    return {
      statement: security.why.split(".")[0] + ".",
      fix: security.priorityAction || security.fix.split(".")[0] + ".",
      location: loc,
      anchor: security.evidence[0] ?? security.category,
      confidence: security.confidence,
    };
  }

  // Null property — most precise path
  if (f.nullProp && f.nullBase) {
    const where = loc ? ` at ${loc}` : "";
    return {
      statement: `Code read property '${f.nullProp}' on ${f.nullBase}${where}. The base value was ${f.nullBase} at runtime (often missing env/config, failed fetch, or optional data).`,
      fix: loc
        ? `In ${loc}, stop using non-null assertions on that value. Use optional chaining (?.${f.nullProp}) or a default before access.`
        : `Use optional chaining (?.${f.nullProp}) or guard with an early return before reading '${f.nullProp}'.`,
      location: loc,
      anchor: f.nullProp,
      confidence: loc ? 0.93 : 0.82,
    };
  }

  // Schema cache
  if (top?.evidence.includes("schema-cache") || has(f, "schema cache")) {
    const target = f.tables[0] || f.functions[0] || "object";
    return {
      statement: `PostgREST schema cache does not expose '${target}'. Live DB is behind the app or cache was not reloaded.`,
      fix: `In Cloud → SQL editor, create/alter public.${target} from migrations, GRANT privileges, then run: NOTIFY pgrst, 'reload schema';`,
      location: loc,
      anchor: target,
      confidence: 0.9,
    };
  }

  // RLS
  if (top?.evidence.includes("rls") || has(f, "42501", "row-level security")) {
    const target = f.tables[0] || "table";
    return {
      statement: `Postgres RLS or missing GRANT blocked access to '${target}'.`,
      fix: `Inspect policies: SELECT * FROM pg_policies WHERE tablename = '${target}'; Add/fix policy for the current role, then NOTIFY pgrst, 'reload schema';`,
      location: loc,
      anchor: target,
      confidence: 0.88,
    };
  }

  // Hooks
  if (top?.evidence.includes("rules-of-hooks")) {
    return {
      statement:
        "React detected a Rules of Hooks violation (conditional hooks or changing order between renders).",
      fix: loc
        ? `In ${loc}, move all hooks to the top level of the component and keep call order identical every render.`
        : "Move all hooks to the top level; never call hooks inside conditions or loops.",
      location: loc,
      anchor: "hooks",
      confidence: 0.91,
    };
  }

  // Hydration
  if (top?.family === "hydration") {
    return {
      statement:
        "Server-rendered HTML did not match the client’s first render (non-deterministic SSR).",
      fix: loc
        ? `In ${loc}, remove Date/random/window usage during render; move browser-only logic into useEffect.`
        : "Keep the first client render identical to server HTML; defer browser APIs to useEffect.",
      location: loc,
      anchor: "hydration",
      confidence: 0.9,
    };
  }

  // Auth
  if (top?.family === "auth") {
    return {
      statement:
        "Authentication or session check failed (credentials, JWT, or role).",
      fix: "Confirm auth.users email shape, reset password if needed, ensure user_roles row exists, sign in again.",
      location: loc,
      anchor: f.httpStatus ? `http:${f.httpStatus}` : "auth",
      confidence: 0.8,
    };
  }

  // Constraint
  if (top?.family === "constraint") {
    const st = f.sqlstates[0] || "constraint";
    return {
      statement: `Database rejected the write due to constraint (${st}).`,
      fix: "Use a real auth.users id for FKs, handle ON CONFLICT for uniques, validate required fields before INSERT.",
      location: loc,
      anchor: st,
      confidence: 0.85,
    };
  }

  // Network
  if (top?.family === "network") {
    return {
      statement: f.httpStatus
        ? `Request failed with HTTP ${f.httpStatus}.`
        : "Network request failed (fetch error or CORS).",
      fix: "Open Network panel for the failing URL; fix CORS/origin or handle the status; backoff on 429/5xx.",
      location: loc,
      anchor: f.httpStatus ? String(f.httpStatus) : "network",
      confidence: 0.75,
    };
  }

  // Gateway
  if (top?.family === "gateway") {
    return {
      statement: "Skippe / AI gateway call failed (key, path, or upstream).",
      fix: "Verify LOVABLE_API_KEY in Cloud → Secrets and the correct vendor endpoint path.",
      location: loc,
      anchor: "gateway",
      confidence: 0.78,
    };
  }

  // Stack overflow
  if (top?.family === "stack_overflow") {
    return {
      statement: "Call stack exceeded limits (infinite or deep recursion).",
      fix: loc
        ? `In ${loc}, add a base case or break the recursive cycle.`
        : "Find the recursive path and add a terminating condition.",
      location: loc,
      anchor: "stack",
      confidence: 0.87,
    };
  }

  // Fallback — still one statement, not a list
  return {
    statement: f.message
      ? `${f.name}: ${f.message.slice(0, 160)}`
      : "Unclassified runtime failure.",
    fix: loc
      ? `Inspect ${loc}; reproduce with logging around that frame.`
      : "Copy the stack, resolve sourcemaps, inspect the top app frame.",
    location: loc,
    anchor: f.name,
    confidence: 0.4,
  };
}

/* ── main API ── */

export function diagnoseBug(error: unknown): BugDiagnosis | null {
  if (error == null) return null;

  const features = extractFeatures(error);
  const security = diagnoseSecurityRisk(error);
  const scorers: ScorerResult[] = [];

  for (const s of ALL_SCORERS) {
    try {
      const r = s(features);
      if (r && r.score >= 30) scorers.push(r);
    } catch {
      /* never throw from scorer */
    }
  }
  scorers.sort((a, b) => b.score - a.score);

  if (
    scorers.length === 0 &&
    !security &&
    features.message.length < 2 &&
    features.stackDepth === 0
  ) {
    return null;
  }

  const top = scorers[0] ?? null;
  const confirmed = synthesizeConfirmed(features, top, security);

  // Family / level
  let family: BugFamily = top?.family ?? "unknown";
  let level: BugLevel = top?.level ?? "low";
  let score = top?.score ?? 20;

  if (security && (security.level === "critical" || security.level === "high")) {
    family = "security";
    level = security.level;
    score = security.score;
  }

  const confidence = Math.min(
    0.97,
    Math.max(confirmed.confidence, (top?.score ?? 20) / 120 + 0.35),
  );

  const title =
    family === "security" && security
      ? security.title
      : top?.titleHint ||
        (features.nullProp
          ? `Null access: reading '${features.nullProp}'`
          : `${features.name}`);

  return {
    isBug: true,
    level,
    family,
    title,
    confirmed,
    summary: confirmed.statement,
    message: features.fullText.slice(0, 2500),
    score: Math.round(Math.min(100, score * confidence + 5)),
    confidence: Math.round(confidence * 100) / 100,
    evidence: top?.evidence ?? [features.name],
    features,
    scorers,
    security,
    isSecurityRelated: Boolean(security),
    fingerprint: fingerprintError(features),
    sqlHints:
      top?.evidence.includes("schema-cache") || top?.evidence.includes("rls")
        ? ["NOTIFY pgrst, 'reload schema';"]
        : undefined,
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
    "CONFIRMED CAUSE:",
    d.confirmed.statement,
    "",
    "CONFIRMED FIX:",
    d.confirmed.fix,
  ];
  if (d.confirmed.location) {
    lines.push("", `Location: ${d.confirmed.location}`);
  }
  if (d.confirmed.anchor) {
    lines.push(`Anchor: ${d.confirmed.anchor}`);
  }
  lines.push("", "Evidence:", ...d.evidence.map((e) => `  - ${e}`));
  if (d.scorers.length > 1) {
    lines.push(
      "",
      "Other scorers:",
      ...d.scorers.slice(1).map((s) => `  - [${s.score}] ${s.family}: ${s.titleHint}`),
    );
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
