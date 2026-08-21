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
  | "reference"
  | "syntax"
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
  /** Module-eval vs runtime */
  phase: "module_load" | "runtime" | "async" | "unknown";
  /** Ordered recovery steps */
  playbook: string[];
  /** User-visible impact */
  impact: string;
  /** Likely related files/patterns */
  relatedHints: string[];
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
  /** e.g. "c" from "c is not defined" */
  undefinedIdent: string | null;
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
        /((?:src|app|routes|components|lib)\/[a-zA-Z0-9_./\-]+\.(?:tsx?|jsx?))(?:\?[^):\s]*)?:(\d+)(?::(\d+))?/,
      ) ||
      line.match(
        /((?:\.\.\/)+src\/[a-zA-Z0-9_./\-]+\.(?:tsx?|jsx?))(?:\?[^):\s]*)?:(\d+)/,
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
  // Chrome/V8 modern: Cannot read properties of null (reading 'volume')
  const modern = message.match(
    /cannot read propert(?:y|ies) of (null|undefined)\s*\(reading ['"]?([a-zA-Z0-9_$]+)['"]?\)/i,
  );
  if (modern) {
    return {
      prop: modern[2],
      base: modern[1].toLowerCase() as "null" | "undefined",
    };
  }
  // Older: Cannot read property 'volume' of null
  const legacy = message.match(
    /cannot read propert(?:y|ies) ['"]?([a-zA-Z0-9_$]+)['"]? of (null|undefined)/i,
  );
  if (legacy) {
    return {
      prop: legacy[1],
      base: legacy[2].toLowerCase() as "null" | "undefined",
    };
  }
  // Optional chaining style / TS: undefined is not an object
  const undef = message.match(
    /(null|undefined) is not an object\s*\(evaluating ['"]?[^'"]*\.([a-zA-Z0-9_$]+)['"]?\)/i,
  );
  if (undef) {
    return {
      prop: undef[2],
      base: undef[1].toLowerCase() as "null" | "undefined",
    };
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
  const undefIdent =
    message.match(
      /(?:ReferenceError:\s*)?([A-Za-z_$][\w$]*)\s+is not defined/i,
    )?.[1] ?? null;
  const isRef =
    name === "ReferenceError" ||
    /referenceerror/i.test(name) ||
    /referenceerror/i.test(message) ||
    Boolean(undefIdent);
  const isSyn =
    name === "SyntaxError" ||
    /syntaxerror/i.test(name) ||
    /unexpected token/i.test(message);

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
    isReferenceError: isRef,
    isSyntaxError: isSyn,
    isAggregate: name === "AggregateError",
    reactMinifiedCode: reactMini?.[1] ?? null,
    nullProp: nullAccess.prop,
    nullBase: nullAccess.base,
    undefinedIdent: undefIdent,
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

/** ReferenceError: identifier is not defined (incl. stray chars like trailing `c`). */
const scoreReferenceError: Scorer = (f) => {
  if (!f.isReferenceError && !f.undefinedIdent) return null;
  const evidence = ["reference-error"];
  if (f.undefinedIdent) evidence.push(`ident:${f.undefinedIdent}`);
  if (f.primaryFile) evidence.push(`file:${f.primaryFile}`);
  if (f.primaryLine != null) evidence.push(`line:${f.primaryLine}`);
  // Single-letter / tiny idents at end of a module are almost always typos/stray keystrokes
  const stray =
    Boolean(f.undefinedIdent) &&
    (f.undefinedIdent!.length <= 2 ||
      (f.primaryLine != null && f.primaryLine <= 3));
  if (stray) evidence.push("likely-stray-token");
  return {
    family: "reference",
    level: "critical",
    score: f.undefinedIdent && f.primaryFile ? 98 : f.undefinedIdent ? 90 : 80,
    evidence,
    titleHint: f.undefinedIdent
      ? `Undefined identifier: ${f.undefinedIdent}`
      : "ReferenceError — identifier not defined",
  };
};

/** SyntaxError — broken source before runtime logic runs. */
const scoreSyntaxError: Scorer = (f) => {
  if (!f.isSyntaxError) return null;
  const evidence = ["syntax-error"];
  if (f.primaryFile) evidence.push(`file:${f.primaryFile}`);
  if (f.primaryLine != null) evidence.push(`line:${f.primaryLine}`);
  return {
    family: "syntax",
    level: "critical",
    score: f.primaryFile ? 96 : 85,
    evidence,
    titleHint: "SyntaxError — file failed to parse",
  };
};


/** Bare HTTPError JSON from TanStack server fns */
const scoreHttpErrorBare: Scorer = (f) => {
  if (!has(f, "httperror") && !/unhandled["']?\s*:\s*true/i.test(f.fullText)) {
    return null;
  }
  const evidence = ["tanstack-http-error"];
  if (f.httpStatus) evidence.push(`http:${f.httpStatus}`);
  return {
    family: "tanstack",
    level: f.httpStatus && f.httpStatus >= 500 ? "high" : "medium",
    score: 88,
    evidence,
    titleHint: "TanStack server function HTTPError",
  };
};

/** Vite / module runner eval failures */
const scoreModuleEval: Scorer = (f) => {
  if (
    !has(f, "module-runner", "runinlinedmodule", "esmodulesevaluator", "failed to fetch dynamically imported")
  ) {
    return null;
  }
  const evidence = ["module-eval"];
  if (f.primaryFile) evidence.push(`file:${f.primaryFile}`);
  return {
    family: "react",
    level: "critical",
    score: 94,
    evidence,
    titleHint: "Module failed while evaluating (Vite runner)",
  };
};

/** Zod validation failures bubbling as 500 */
const scoreZodValidation: Scorer = (f) => {
  if (!has(f, "zoderror", "invalid_type", "too_big", "unrecognized_keys")) return null;
  return {
    family: "tanstack",
    level: "medium",
    score: 82,
    evidence: ["zod-validation"],
    titleHint: "Schema validation failed (zod)",
  };
};

const ALL_SCORERS: Scorer[] = [
  scoreReferenceError,
  scoreSyntaxError,
  scoreHttpErrorBare,
  scoreModuleEval,
  scoreZodValidation,
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
      statement: (security.why || security.risk || security.title).split(".")[0] + ".",
      fix: (security.fix || "See security fix details.").split(".")[0] + ".",
      location: loc,
      anchor: security.title,
      confidence: 0.9,
    };
  }

  // ReferenceError — e.g. "c is not defined" from a stray character at EOF
  if (f.isReferenceError || f.undefinedIdent || top?.family === "reference") {
    const id = f.undefinedIdent ?? "unknown";
    const short = id.length <= 2;
    return {
      statement: short
        ? `ReferenceError: '${id}' is not defined — almost always a stray character or unfinished edit (not a missing import).`
        : `ReferenceError: '${id}' was used but never declared or imported in this scope.`,
      fix: loc
        ? short
          ? `Open ${loc}. Delete the lone '${id}' (often the last line of the file after a closing }). Save and hard-refresh.`
          : `Open ${loc}. Either import/declare '${id}', or remove the reference if it was accidental.`
        : short
          ? `Search the broken route file for a lone '${id}' (check the very last lines). Delete it, save, hard-refresh.`
          : `Find where '${id}' is used without import/const/let/function. Add the missing binding or remove the call.`,
      location: loc,
      anchor: id,
      confidence: short ? 0.97 : 0.93,
    };
  }

  // SyntaxError
  if (f.isSyntaxError || top?.family === "syntax") {
    return {
      statement:
        "SyntaxError: the source file could not be parsed (unclosed bracket, bad token, or broken template).",
      fix: loc
        ? `Open ${loc}, fix the syntax around that line, save, and reload.`
        : "Open the file named in the stack, fix the parse error, save, reload.",
      location: loc,
      anchor: "syntax",
      confidence: 0.94,
    };
  }

  // Null property — most precise path
  if (f.nullProp && f.nullBase) {
    const minified =
      Boolean(loc) &&
      (/assets\/|chunks\/|\.js:\d+$/i.test(loc || "") ||
        /\/assets\//i.test(loc || ""));
    const where = loc
      ? minified
        ? ` (bundled frame ${loc}; resolve sourcemap for the real .tsx line)`
        : ` at ${loc}`
      : "";
    return {
      statement: `Code read property '${f.nullProp}' on ${f.nullBase}${where}. The base value was ${f.nullBase} at runtime (often missing env/config, failed fetch, or optional data).`,
      fix: minified
        ? `Guard the access to '.${f.nullProp}': use optional chaining (?.${f.nullProp}) or a default. In dev, open the error overlay source map to jump to the real file (often src/routes/*.tsx). Remove non-null assertions (!) on values that can be null.`
        : loc
          ? `In ${loc}, stop using non-null assertions on that value. Use optional chaining (?.${f.nullProp}) or a default before access.`
          : `Use optional chaining (?.${f.nullProp}) or guard with an early return before reading '${f.nullProp}'.`,
      location: loc,
      anchor: f.nullProp,
      confidence: minified ? 0.88 : loc ? 0.93 : 0.82,
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

  // TanStack bare HTTPError
  if (top?.family === "tanstack" || has(f, "httperror")) {
    return {
      statement:
        "A server function threw before returning a structured body (TanStack surfaces this as HTTPError).",
      fix: "Find the server fn in the Network tab; wrap handler paths so they return data instead of throw; check auth middleware and zod validators.",
      location: loc,
      anchor: f.httpStatus ? `http:${f.httpStatus}` : "HTTPError",
      confidence: 0.9,
    };
  }

  // Module evaluation
  if (top?.evidence.includes("module-eval")) {
    return {
      statement:
        "The route/module crashed while evaluating (before React could render) — often a stray token or bad top-level import.",
      fix: loc
        ? `Open ${loc}, fix the top-level syntax/reference, save, hard refresh.`
        : "Open the file named in the stack (often a routes/*.tsx), fix the top-level error, hard refresh.",
      location: loc,
      anchor: "module_load",
      confidence: 0.94,
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
    score = 80;
  }

  const phase: BugDiagnosis["phase"] = features.fullText.match(
    /module-runner|runInlinedModule|ESModulesEvaluator/i,
  )
    ? "module_load"
    : features.fullText.match(/unhandledrejection|promise/i)
      ? "async"
      : features.stackDepth > 0
        ? "runtime"
        : "unknown";

  const playbook = [
    confirmed.fix,
    confirmed.location
      ? `Jump to ${confirmed.location} and inspect ±15 lines.`
      : "Copy the stack and open the top app frame in the repo.",
    phase === "module_load"
      ? "Hard refresh after save — module-load bugs cache aggressively in Vite."
      : "Reproduce once with Console + Network open.",
    security && (security.level === "critical" || security.level === "high")
      ? "Treat as security-relevant until proven otherwise; avoid pasting secrets into tickets."
      : "If it persists, capture a minimal reproduction message/route.",
  ];

  const impact =
    level === "critical"
      ? "Blank screen or total route failure until fixed."
      : level === "high"
        ? "Core staff/customer flow is broken or unsafe."
        : "Degraded UX; some actions may fail.";

  const relatedHints = [
    features.primaryFile ? `file:${features.primaryFile}` : "",
    features.undefinedIdent ? `ident:${features.undefinedIdent}` : "",
    features.nullProp ? `nullProp:${features.nullProp}` : "",
    features.tables[0] ? `table:${features.tables[0]}` : "",
    phase !== "unknown" ? `phase:${phase}` : "",
  ].filter(Boolean);

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
    isSecurityRelated: Boolean(
      security &&
        (security.level === "critical" ||
          security.level === "high" ||
          family === "security"),
    ),
    fingerprint: fingerprintError(features),
    phase,
    playbook,
    impact,
    relatedHints,
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
  if (
    d.security &&
    d.isSecurityRelated &&
    (d.security.level === "critical" || d.security.level === "high")
  ) {
    lines.push("", "── Security ──", formatSecurityDiagnosisForCopy(d.security));
  }
  lines.push("", `Phase: ${d.phase}`, `Impact: ${d.impact}`);
  if (d.relatedHints?.length) {
    lines.push(`Hints: ${d.relatedHints.join(", ")}`);
  }
  if (d.playbook?.length) {
    lines.push("", "Playbook:");
    d.playbook.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
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

/* ── GLOBAL (required by __root.tsx + router.tsx) ── */

let globalInstalled = false;

/** Visible overlay so blank-screen crashes still show Why / Fix (zero DB). */
function showBugOverlay(d: BugDiagnosis) {
  if (typeof document === "undefined") return;
  const id = "pb-global-bug-overlay";
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement("div");
    root.id = id;
    root.setAttribute("role", "alert");
    document.body?.appendChild(root);
  }
  const isSec = d.isSecurityRelated || d.family === "security";
  const border = isSec ? "#f59e0b" : d.level === "critical" ? "#ef4444" : "#e11d48";
  root.innerHTML = "";
  root.style.cssText = [
    "position:fixed",
    "inset:auto 12px 12px 12px",
    "z-index:2147483646",
    "max-width:520px",
    "margin:0 auto",
    "left:12px",
    "right:12px",
    `border:1px solid ${border}`,
    "border-radius:12px",
    "background:rgba(15,10,12,0.96)",
    "color:#faf7f5",
    "padding:14px 16px",
    "font:13px/1.45 system-ui,sans-serif",
    "box-shadow:0 12px 40px rgba(0,0,0,0.45)",
  ].join(";");
  const title = document.createElement("div");
  title.style.cssText =
    "font-weight:700;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.9;margin-bottom:6px";
  title.textContent = isSec
    ? `Security · ${d.level}`
    : `Bug detector · ${d.level} · ${d.family}`;
  const why = document.createElement("div");
  why.style.marginBottom = "6px";
  why.innerHTML = `<strong>Why:</strong> ${escapeHtml(d.confirmed.statement)}`;
  const fix = document.createElement("div");
  fix.style.marginBottom = "6px";
  fix.innerHTML = `<strong>Fix:</strong> ${escapeHtml(d.confirmed.fix)}`;
  const where = document.createElement("div");
  where.style.cssText = "opacity:0.75;font-size:12px;margin-bottom:10px";
  where.textContent = d.confirmed.location
    ? `Where: ${d.confirmed.location} · ${d.phase} · impact: ${d.impact}`
    : `${d.message.slice(0, 160)} · ${d.phase}`;
  const steps = document.createElement("ol");
  steps.style.cssText = "margin:0 0 10px 18px;padding:0;opacity:0.9";
  (d.playbook || []).slice(0, 3).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    steps.appendChild(li);
  });
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy diagnosis";
  copyBtn.style.cssText =
    "border:0;border-radius:8px;padding:6px 10px;background:#fff;color:#111;font-weight:600;cursor:pointer";
  copyBtn.onclick = () => {
    void navigator.clipboard?.writeText(formatBugDiagnosisForCopy(d));
    copyBtn.textContent = "Copied";
  };
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Dismiss";
  closeBtn.style.cssText =
    "border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:6px 10px;background:transparent;color:#fff;cursor:pointer";
  closeBtn.onclick = () => root?.remove();
  row.append(copyBtn, closeBtn);
  root.append(title, why, fix, where, steps, row);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Call once from RootComponent — covers every file without per-page edits. */
export function installGlobalBugDetector(): () => void {
  if (typeof window === "undefined" || globalInstalled) {
    return () => {};
  }
  globalInstalled = true;

  const handle = (err: unknown, source: string) => {
    const d = diagnoseBug(err);
    if (!d) return;
    console.warn(
      "[GlobalBug]",
      source,
      d.fingerprint,
      d.confirmed.statement,
      d.confirmed.fix,
    );
    // Always show UI for critical/high (blank screens otherwise hide console)
    if (
      d.level === "critical" ||
      d.level === "high" ||
      d.family === "reference" ||
      d.family === "syntax" ||
      d.isSecurityRelated
    ) {
      try {
        showBugOverlay(d);
      } catch {
        /* ignore */
      }
    }
    try {
      void import("./lovable-error-reporting").then((m) => {
        m.reportLovableError?.(err, {
          source,
          bug_family: d.family,
          bug_score: d.score,
          bug_fingerprint: d.fingerprint,
          confirmed_cause: d.confirmed.statement,
          confirmed_fix: d.confirmed.fix,
        });
      });
    } catch {
      /* ignore */
    }
  };

  const onError = (event: ErrorEvent) => {
    // Prefer Error object; fall back to message string (module-load ReferenceErrors)
    const err =
      event.error ??
      (event.message
        ? Object.assign(new Error(event.message), { name: "ReferenceError" })
        : null);
    handle(err, "window.onerror");
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    handle(event.reason, "unhandledrejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    globalInstalled = false;
    document.getElementById("pb-global-bug-overlay")?.remove();
  };
}

/** Used by router.tsx QueryClient cache subscription. */
export function reportQueryBug(
  error: unknown,
  meta?: Record<string, unknown>,
) {
  const d = diagnoseBug(error);
  if (!d) return;
  console.warn("[QueryBug]", d.fingerprint, d.confirmed.statement);
  try {
    void import("./lovable-error-reporting").then((m) => {
      m.reportLovableError?.(error, {
        source: "react_query",
        bug_family: d.family,
        bug_score: d.score,
        bug_fingerprint: d.fingerprint,
        confirmed_cause: d.confirmed.statement,
        confirmed_fix: d.confirmed.fix,
        ...meta,
      });
    });
  } catch {
    /* ignore */
  }
}
