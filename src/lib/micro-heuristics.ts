/**
 * micro-heuristics.ts — ultra-fine bug & security signals (zero DB, zero LLM)
 *
 * Catches tiny but real issues Lovable’s generic overlay often collapses into
 * "Runtime Error" / HTTPError. Pure string + stack analysis.
 */

export type MicroHit = {
  id: string;
  domain: "bug" | "security";
  level: "critical" | "high" | "medium" | "low" | "info";
  weight: number;
  title: string;
  why: string;
  fix: string;
  evidence: string[];
};

type Ctx = { text: string; lower: string; stack: string };

const hit = (
  id: string,
  domain: MicroHit["domain"],
  level: MicroHit["level"],
  weight: number,
  title: string,
  why: string,
  fix: string,
  evidence: string[],
): MicroHit => ({ id, domain, level, weight, title, why, fix, evidence });

/** 40+ micro rules — order does not matter; ranked by weight later */
const MICRO_RULES: Array<(c: Ctx) => MicroHit | null> = [
  // ── stray / typo tokens ─────────────────────────────────────────────
  (c) => {
    const m = c.text.match(
      /(?:ReferenceError:\s*)?([A-Za-z_$][\w$]*)\s+is not defined/i,
    );
    if (!m) return null;
    const id = m[1];
    const short = id.length <= 2;
    return hit(
      "undef_ident",
      "bug",
      "critical",
      short ? 99 : 92,
      short
        ? `Stray token '${id}' (almost never a real variable)`
        : `Undefined identifier '${id}'`,
      short
        ? `A 1–2 character identifier is undefined. This is usually a leftover keystroke (often the last line of a file after }).`
        : `'${id}' was referenced without import/const/let/function in scope.`,
      short
        ? `Open the stack file, jump to the reported line (often EOF). Delete the lone '${id}'. Save + hard refresh.`
        : `Import or declare '${id}', or remove the reference.`,
      ["reference-error", `ident:${id}`, short ? "stray-token" : "missing-binding"],
    );
  },
  (c) => {
    if (!/unexpected token/i.test(c.lower)) return null;
    const m = c.text.match(/unexpected token\s+['"]?([^'"]+)['"]?/i);
    const tok = m?.[1] ?? "?";
    return hit(
      "unexpected_token",
      "bug",
      "critical",
      95,
      `Unexpected token ${tok}`,
      "Parser hit a token that is illegal in that position (missing comma, bad JSX, or stray character).",
      "Open the file:line from the stack; fix the token/bracket pair; save.",
      ["syntax", `token:${tok}`],
    );
  },
  (c) => {
    if (!/unexpected end of input|unexpected eof/i.test(c.lower)) return null;
    return hit(
      "unexpected_eof",
      "bug",
      "critical",
      96,
      "Unexpected end of input",
      "A bracket, paren, or template literal was never closed before EOF.",
      "Balance {}, (), [], and `` in the file from the stack; check the last 30 lines.",
      ["syntax", "unclosed-delimiter"],
    );
  },

  // ── React / hooks micro ─────────────────────────────────────────────
  (c) => {
    if (!/invalid hook call|hooks can only be called/i.test(c.lower)) return null;
    return hit(
      "invalid_hook_call",
      "bug",
      "critical",
      97,
      "Invalid Hook call",
      "Hooks ran outside a function component / custom hook, or duplicate React copies are loaded.",
      "Move hooks to top-level of a component; ensure a single React instance in the bundle.",
      ["react-hooks"],
    );
  },
  (c) => {
    if (!/rendered more hooks than during the previous render/i.test(c.lower))
      return null;
    return hit(
      "hooks_order_changed",
      "bug",
      "critical",
      96,
      "Hook call order changed between renders",
      "A hook is inside a condition/loop so the call count changed.",
      "Never call hooks behind if/for; keep order identical every render.",
      ["react-hooks", "conditional-hook"],
    );
  },
  (c) => {
    if (!/each child in a list should have a unique ["']key["']/i.test(c.lower))
      return null;
    return hit(
      "missing_list_key",
      "bug",
      "medium",
      70,
      "Missing unique key in list",
      "React list children lack stable key props — updates can mis-associate state.",
      "Add key={stableId} on the outermost element returned from map().",
      ["react-key"],
    );
  },
  (c) => {
    if (!/maximum update depth exceeded/i.test(c.lower)) return null;
    return hit(
      "max_update_depth",
      "bug",
      "critical",
      95,
      "Maximum update depth exceeded",
      "setState is triggered every render (often setState during render or unstable deps).",
      "Move state updates into event handlers/useEffect; fix dependency arrays that change every render.",
      ["react-loop"],
    );
  },
  (c) => {
    if (!/hydration failed|text content does not match server/i.test(c.lower))
      return null;
    return hit(
      "hydration_mismatch",
      "bug",
      "high",
      88,
      "Hydration mismatch",
      "Server HTML did not match the client’s first paint (Date/random/window during render).",
      "Defer browser-only values to useEffect; keep first client render identical to SSR HTML.",
      ["hydration"],
    );
  },
  (c) => {
    if (!/cannot update a component .* while rendering a different component/i.test(c.lower))
      return null;
    return hit(
      "setstate_while_render",
      "bug",
      "high",
      86,
      "setState while rendering another component",
      "A child triggered a parent state update during render.",
      "Schedule updates in useEffect or event handlers, not in render body.",
      ["react-setstate-render"],
    );
  },

  // ── Promise / async micro ───────────────────────────────────────────
  (c) => {
    if (!/unhandledpromise|unhandled rejection/i.test(c.lower)) return null;
    return hit(
      "unhandled_rejection",
      "bug",
      "high",
      84,
      "Unhandled promise rejection",
      "An async path threw without catch — UI may hang with no toast.",
      "Add try/catch or .catch() on the promise; surface a user-visible error.",
      ["async", "unhandled-rejection"],
    );
  },
  (c) => {
    if (!/cancel(led)? in progress|aborterror/i.test(c.lower)) return null;
    return hit(
      "request_aborted",
      "bug",
      "low",
      40,
      "Request aborted",
      "Fetch was aborted (navigation/unmount). Often benign.",
      "Ignore AbortError on unmount; avoid setState after abort.",
      ["abort"],
    );
  },

  // ── DOM / browser micro ─────────────────────────────────────────────
  (c) => {
    if (!/cannot read propert(?:y|ies) of null \(reading ['"]?(volume|currentTime|play|pause)['"]?\)/i.test(c.lower))
      return null;
    return hit(
      "media_element_null",
      "bug",
      "medium",
      78,
      "Media element not mounted yet",
      "Code touched video/audio properties before the element existed (common in fridge-share).",
      "Guard with if (!video) return; or use onLoadedMetadata before play/volume.",
      ["dom", "media"],
    );
  },
  (c) => {
    if (!/resizeobserver loop/i.test(c.lower)) return null;
    return hit(
      "resize_observer_loop",
      "bug",
      "info",
      25,
      "ResizeObserver loop warning",
      "Layout thrash notification — usually non-fatal.",
      "Batch DOM reads/writes; avoid setState directly inside ResizeObserver without rAF.",
      ["dom", "resize-observer"],
    );
  },
  (c) => {
    if (!/quotaexceedederror|localstorage.*quota/i.test(c.lower)) return null;
    return hit(
      "storage_quota",
      "bug",
      "medium",
      72,
      "localStorage quota exceeded",
      "Persisted chat/images exceeded browser storage (Skippe draft images are heavy).",
      "Trim stored messages/images; store fewer data-URLs; catch QuotaExceededError.",
      ["storage"],
    );
  },
  (c) => {
    if (!/securityerror|blocked a frame|cross-origin/i.test(c.lower) && /canvas|tainted/i.test(c.lower))
      return null;
    if (!/tainted canvases|tainted canvas/i.test(c.lower)) return null;
    return hit(
      "tainted_canvas",
      "bug",
      "medium",
      74,
      "Tainted canvas (cross-origin)",
      "Canvas drew a cross-origin image without CORS — toDataURL is blocked.",
      "Serve images with CORS headers or proxy; set img.crossOrigin = 'anonymous' before src.",
      ["canvas", "cors"],
    );
  },

  // ── TanStack / Vite micro ───────────────────────────────────────────
  (c) => {
    if (!/httperror/i.test(c.lower) && !/unhandled["']?\s*:\s*true/i.test(c.text))
      return null;
    return hit(
      "tanstack_http_error",
      "bug",
      "high",
      90,
      "TanStack server fn HTTPError",
      "A createServerFn threw before returning JSON — client only sees HTTPError.",
      "Wrap server handlers to return structured errors; soft-fail auth/zod instead of throw.",
      ["tanstack", "server-fn"],
    );
  },
  (c) => {
    if (!/failed to fetch dynamically imported module/i.test(c.lower)) return null;
    return hit(
      "dynamic_import_fail",
      "bug",
      "high",
      87,
      "Dynamic import failed",
      "Chunk deploy mismatch or network blip loading a lazy route.",
      "Hard refresh; if persistent, check deploy completed and chunk URLs 200.",
      ["vite", "chunk"],
    );
  },
  (c) => {
    if (!/module-runner|runinlinedmodule|esmodulesevaluator/i.test(c.lower))
      return null;
    return hit(
      "vite_module_eval",
      "bug",
      "critical",
      94,
      "Vite module evaluation crash",
      "The module threw while being evaluated (top-level code), before React render.",
      "Fix the top-level throw in the stack file (often routes/*.tsx); hard refresh.",
      ["vite", "module_load"],
    );
  },
  (c) => {
    if (!/zoderror|invalid_type|too_big|unrecognized_keys/i.test(c.lower))
      return null;
    return hit(
      "zod_validation",
      "bug",
      "medium",
      80,
      "Zod validation failed",
      "Input did not match the server schema (wrong types, too large images, bad enum).",
      "Align client payload with zod schema; raise limits only if intentional.",
      ["zod"],
    );
  },

  // ── Supabase / data micro ───────────────────────────────────────────
  (c) => {
    if (!/pgrst204|could not find the .* column/i.test(c.lower)) return null;
    const col = c.text.match(/column\s+['"]?([a-z0-9_]+)['"]?/i)?.[1];
    return hit(
      "missing_column",
      "bug",
      "high",
      89,
      col ? `Missing column '${col}'` : "Missing column in schema cache",
      "PostgREST schema cache does not know this column (migration not applied or wrong name).",
      "Apply migration / rename field; NOTIFY pgrst, 'reload schema'; remove dead selects.",
      ["postgrest", col ? `col:${col}` : "column"],
    );
  },
  (c) => {
    if (!/pgrst205|could not find the table/i.test(c.lower)) return null;
    return hit(
      "missing_table",
      "bug",
      "high",
      90,
      "Missing table in schema cache",
      "Query targets a table PostgREST does not expose.",
      "Create/expose the table; reload schema cache; check search_path.",
      ["postgrest", "table"],
    );
  },
  (c) => {
    if (!/jwt expired|invalid jwt|session expired/i.test(c.lower)) return null;
    return hit(
      "jwt_expired",
      "bug",
      "medium",
      76,
      "Session JWT expired/invalid",
      "Auth token is no longer accepted.",
      "Sign out/in; ensure middleware uses a fresh Bearer token.",
      ["auth", "jwt"],
    );
  },

  // ── Skippe / gateway micro ──────────────────────────────────────────
  (c) => {
    if (!/lovable_api_key|ai\.gateway\.lovable|credits exhausted|402/i.test(c.lower))
      return null;
    return hit(
      "skippe_gateway",
      "security",
      "high",
      85,
      "Skippe gateway key/credits",
      "AI gateway rejected the call (key or credits).",
      "Set LOVABLE_API_KEY in secrets; top up credits; never hardcode keys.",
      ["skippe", "gateway"],
    );
  },
  (c) => {
    if (!/function response parts|function call parts/i.test(c.lower)) return null;
    return hit(
      "tool_call_mismatch",
      "bug",
      "high",
      88,
      "Tool call / response count mismatch",
      "Model returned N tool calls but the client sent ≠ N tool results (Skippe multi-round).",
      "Cap tool_calls and tool responses to the same length; prefer single-round tool use.",
      ["skippe", "tool-protocol"],
    );
  },

  // ── Security micro (subtle) ─────────────────────────────────────────
  (c) => {
    if (!/service.?role/i.test(c.lower)) return null;
    if (!/client|browser|vite|localstorage|import\.meta/i.test(c.lower)) return null;
    return hit(
      "service_role_client",
      "security",
      "critical",
      100,
      "service_role referenced in client context",
      "Service role material must never appear in browser bundles or client errors.",
      "Remove service_role from any VITE_/client code; rotate the key if exposed.",
      ["secret", "service_role"],
    );
  },
  (c) => {
    if (!/password|secret|apikey|api_key|token/i.test(c.lower)) return null;
    if (!/(=|:) .{8,}/.test(c.text) && !/eyJ[a-zA-Z0-9_-]+\./.test(c.text))
      return null;
    if (!/eyJ[a-zA-Z0-9_-]+\./.test(c.text) && !/sk[_-]/i.test(c.text)) return null;
    return hit(
      "secret_in_error",
      "security",
      "critical",
      98,
      "Secret-looking material in error text",
      "Error payload may include JWT/API key material — treat as potential leak.",
      "Redact secrets from client errors; rotate any key that appeared in logs.",
      ["secret-leak"],
    );
  },
  (c) => {
    if (!/row-level security|42501|permission denied for/i.test(c.lower))
      return null;
    return hit(
      "rls_denied",
      "security",
      "high",
      86,
      "RLS / permission denied",
      "Postgres RLS or GRANT blocked the operation.",
      "Inspect pg_policies for the table; fix policy for the role; avoid bypassing with service_role from client.",
      ["rls"],
    );
  },
  (c) => {
    if (!/__proto__|prototype pollution/i.test(c.lower)) return null;
    return hit(
      "proto_pollution",
      "security",
      "high",
      87,
      "Prototype pollution signal",
      "Untrusted object keys may mutate Object.prototype.",
      "Allowlist fields; block __proto__/constructor keys in merges.",
      ["injection"],
    );
  },
  (c) => {
    if (!/\.\.\/|\.\.\\|%2e%2e/i.test(c.text)) return null;
    return hit(
      "path_traversal",
      "security",
      "high",
      84,
      "Path traversal sequence",
      "Input contains .. path segments.",
      "Reject ..; resolve under a safe root.",
      ["path"],
    );
  },
  (c) => {
    if (!/<script|javascript:|onerror\s*=/i.test(c.lower)) return null;
    return hit(
      "xss_payload_signal",
      "security",
      "high",
      83,
      "XSS payload signal in error/context",
      "Script-like content appeared in diagnostic text — ensure it is never written with innerHTML.",
      "Use textContent; sanitize any HTML; CSP as backstop.",
      ["xss"],
    );
  },

  // ── Tiny but real quality micro ─────────────────────────────────────
  (c) => {
    if (!/nan\b|is not a number/i.test(c.lower)) return null;
    if (!/price|stock|quantity|fee|total|b\$/i.test(c.lower)) return null;
    return hit(
      "nan_money",
      "bug",
      "medium",
      71,
      "NaN in numeric money/stock path",
      "A price/stock calculation produced NaN — UI will show broken totals.",
      "Coerce with Number() and guard Number.isFinite before write.",
      ["nan", "money"],
    );
  },
  (c) => {
    if (!/cannot read propert(?:y|ies) of undefined \(reading ['"]?map['"]?\)/i.test(c.lower))
      return null;
    return hit(
      "map_on_undefined",
      "bug",
      "medium",
      79,
      ".map on undefined",
      "UI expected an array but got undefined (query not loaded / wrong default).",
      "Default to []: (items ?? []).map(...); handle loading state.",
      ["type_null", "map"],
    );
  },
  (c) => {
    if (!/cannot read propert(?:y|ies) of undefined \(reading ['"]?length['"]?\)/i.test(c.lower))
      return null;
    return hit(
      "length_on_undefined",
      "bug",
      "medium",
      77,
      ".length on undefined",
      "Code assumed a string/array existed.",
      "Optional chain: value?.length ?? 0.",
      ["type_null", "length"],
    );
  },
  (c) => {
    if (!/minified react error #310/i.test(c.lower)) return null;
    return hit(
      "react_310",
      "bug",
      "high",
      85,
      "React #310 (rendered nothing / invalid return)",
      "A component returned undefined incorrectly in a list or portal edge case.",
      "Ensure every component returns valid React nodes (null ok, undefined not in some paths).",
      ["react-minified", "310"],
    );
  },
  (c) => {
    if (!/minified react error #31/i.test(c.lower)) return null;
    return hit(
      "react_31",
      "bug",
      "high",
      84,
      "React #31 (objects as text children)",
      "An object/array was rendered directly as text.",
      "Render strings/numbers only; JSON.stringify for debug, never raw objects in JSX.",
      ["react-minified", "31"],
    );
  },
  (c) => {
    if (!/act\(\.\.\.\)|not wrapped in act/i.test(c.lower)) return null;
    return hit(
      "act_warning",
      "bug",
      "info",
      30,
      "React act() warning",
      "Test/dev-only warning about updates outside act().",
      "Wrap test updates in act(); ignore in production if isolated to tests.",
      ["react-test"],
    );
  },
  (c) => {
    if (!/each.*key.*unique|two children with the same key/i.test(c.lower))
      return null;
    return hit(
      "duplicate_key",
      "bug",
      "medium",
      73,
      "Duplicate React key",
      "Two list children share the same key — state can attach to the wrong row.",
      "Use unique stable ids (not array index if list reorders).",
      ["react-key", "duplicate"],
    );
  },
  (c) => {
    if (!/too many re-renders/i.test(c.lower)) return null;
    return hit(
      "too_many_rerenders",
      "bug",
      "critical",
      93,
      "Too many re-renders",
      "Render triggers setState unconditionally.",
      "Remove setState from render body; gate behind events/effects.",
      ["react-loop"],
    );
  },
  (c) => {
    if (!/networkerror|failed to fetch|load failed/i.test(c.lower)) return null;
    return hit(
      "network_failed",
      "bug",
      "medium",
      68,
      "Network request failed",
      "Fetch never got a response (offline, CORS, or server down).",
      "Check Network tab; fix CORS/URL; add offline-friendly error UI.",
      ["network"],
    );
  },
  (c) => {
    if (!/chunkloaderror|loading chunk \d+ failed/i.test(c.lower)) return null;
    return hit(
      "chunk_load",
      "bug",
      "high",
      86,
      "ChunkLoadError",
      "Browser loaded an old index that points at deleted deploy chunks.",
      "Hard refresh / clear cache; ensure atomic deploys.",
      ["vite", "chunk"],
    );
  },
  (c) => {
    if (!/script error\.?/i.test(c.lower) && c.text.trim().length < 40)
      return null;
    if (c.text.trim().toLowerCase() !== "script error.") return null;
    return hit(
      "script_error_opaque",
      "bug",
      "medium",
      60,
      "Opaque cross-origin Script error.",
      "Browser hid the real message (cross-origin script without CORS).",
      "Serve scripts with CORS + crossorigin attribute to see real stacks.",
      ["cors", "opaque-error"],
    );
  },
];

export function runMicroHeuristics(error: unknown): MicroHit[] {
  const name =
    error instanceof Error ? error.name : typeof error === "string" ? "" : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  const stack = error instanceof Error && error.stack ? error.stack : "";
  const text = `${name}: ${message}\n${stack}`.slice(0, 20000);
  const ctx: Ctx = { text, lower: text.toLowerCase(), stack };

  const hits: MicroHit[] = [];
  for (const rule of MICRO_RULES) {
    try {
      const h = rule(ctx);
      if (h) hits.push(h);
    } catch {
      /* never throw */
    }
  }
  hits.sort((a, b) => b.weight - a.weight);
  return hits;
}

export function topMicroHit(error: unknown): MicroHit | null {
  return runMicroHeuristics(error)[0] ?? null;
}
