type LovableErrorOptions = {
  mechanism?:
    | "manual"
    | "onerror"
    | "unhandledrejection"
    | "react_error_boundary"
    | "skippe_health";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}

export function reportSkippeIssue(
  message: string,
  context: Record<string, unknown> = {},
  severity: "error" | "warning" | "info" = "warning",
) {
  if (typeof window === "undefined") return;

  const err = new Error(message);
  err.name = "SkippeIssue";

  window.__lovableEvents?.captureException?.(
    err,
    {
      source: "skippe",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "skippe_health",
      handled: true,
      severity,
    },
  );

  if (severity === "error") {
    console.error("[Skippe]", message, context);
  } else {
    console.warn("[Skippe]", message, context);
  }
}

const BAD_REPLY_PATTERNS: RegExp[] = [
  /i couldn't put a reply together/i,
  /try asking again/i,
  /encountered an error when trying/i,
  /please try again in a moment/i,
  /sorry — i hit an error/i,
  /could not create discount/i,
  /create_discount failed/i,
  /skippe call failed/i,
  /skippe gateway/i,
  /skippe auth failed/i,
  /couldn't create the discount/i,
  /schema cache/i,
];

export type SkippeRunLike = {
  name: string;
  ok: boolean;
  summary: string;
  detail?: string;
};

export type SkippeDiagnosis = {
  /** Short headline */
  title: string;
  /** Why this happened */
  why: string;
  /** Where in the codebase */
  where: string;
  /** Approximate lines / case */
  lines: string;
  /** What to do next */
  fix: string;
  /** Full combined message for Error.message */
  message: string;
};

/** Map known failure text → diagnosis with file/line/why/fix. */
export function diagnoseSkippeFailure(raw: string): SkippeDiagnosis {
  const text = raw || "Unknown Skippe failure";

  if (/schema cache|could not find the table.*discounts/i.test(text)) {
    return {
      title: "Discount table missing or wrong name",
      why: "Skippe tried to read/write a discounts table that PostgREST does not know. The live table is public.chef_discounts (see supabase types + menu.functions.ts). If the code still says public.discounts, it will fail.",
      where: "src/lib/skippe.server.ts → runSkippeTool → case \"create_discount\" / list_discounts / update_discount / end_discount",
      lines: "Discount tool cases (search: from(\"chef_discounts\")). Types: src/integrations/supabase/types.ts → chef_discounts",
      fix: "1) Confirm every discount query uses .from(\"chef_discounts\"). 2) In Supabase, ensure table public.chef_discounts exists and is exposed in the API schema. 3) Reload schema cache (Dashboard → Settings → API → reload) if you just created the table.",
      message: text,
    };
  }

  if (/LOVABLE_API_KEY|auth failed \(401\)|Missing API key/i.test(text)) {
    return {
      title: "Skippe cannot authenticate to Lovable AI gateway",
      why: "LOVABLE_API_KEY is missing or invalid in the server environment.",
      where: "src/lib/skippe.server.ts → gatewayKey()",
      lines: "gatewayKey() near the transports section",
      fix: "In Lovable: Cloud → Secrets → ensure LOVABLE_API_KEY exists (usually auto-injected). Redeploy after adding it.",
      message: text,
    };
  }

  if (/model is not supported on \/v1\/responses/i.test(text)) {
    return {
      title: "Wrong AI endpoint for this model",
      why: "/v1/responses only accepts OpenAI models. Gemini must use /v1/chat/completions.",
      where: "src/lib/skippe.server.ts → runSkippeTurn / runGoogleTurn / runOpenAiTurn",
      lines: "runSkippeTurn routes by MODEL_VENDOR; Google path must call /v1/chat/completions",
      fix: "Ensure Google models call runGoogleTurn (chat/completions), OpenAI models call runOpenAiTurn (responses).",
      message: text,
    };
  }

  if (/404 page not found|skippe gateway 404/i.test(text)) {
    return {
      title: "AI gateway path not found",
      why: "The request hit a URL Lovable's gateway does not serve (often the old Gemini :generateContent path).",
      where: "src/lib/skippe.server.ts → fetch() inside runOpenAiTurn or runGoogleTurn",
      lines: "OpenAI: /v1/responses · Google: /v1/chat/completions",
      fix: "Do not call /v1beta/models/…:generateContent. Use the two paths above only.",
      message: text,
    };
  }

  if (/zero tools|ran zero tools/i.test(text)) {
    return {
      title: "Model replied without calling any kitchen tools",
      why: "The LLM answered in plain text and skipped function calls, so nothing changed in the database.",
      where: "src/lib/skippe.server.ts → runGoogleTurn / runOpenAiTurn tool loop; fallback maybeRunIntentFallback",
      lines: "Tool loop (max 2 rounds) and maybeRunIntentFallback after empty runs",
      fix: "Retry with clearer wording (e.g. \"create an automatic 10% discount named test\"). Intent fallback should catch common discount shorthand. If it keeps happening, switch mode to GPT-5 Nano for stronger tool use.",
      message: text,
    };
  }

  if (/empty reply/i.test(text)) {
    return {
      title: "Empty assistant reply after the model finished",
      why: "The gateway returned no assistant text (and no usable tool summary).",
      where: "src/lib/skippe.server.ts → end of runGoogleTurn / runOpenAiTurn; src/lib/panda.functions.ts reply assembly",
      lines: "synthesizeReplyFromRuns() and pandaChat handler",
      fix: "Check gateway status and model. Soft fallback should summarize tool runs when present.",
      message: text,
    };
  }

  if (/create_discount failed|couldn't create the discount/i.test(text)) {
    return {
      title: "create_discount tool failed",
      why: "The tool ran, but Supabase rejected the insert/update (permissions, schema, constraint, or RLS).",
      where: "src/lib/skippe.server.ts → case \"create_discount\"",
      lines: "Insert into public.chef_discounts inside runSkippeTool switch",
      fix: "Read the supabase: … part of the message. Check RLS policies on chef_discounts for the chef role, required columns (name, owner_id, discount_type, value), and that the table is exposed to the API.",
      message: text,
    };
  }

  if (/not assigned to you/i.test(text)) {
    return {
      title: "Order is not assigned to this chef",
      why: "Skippe only mutates order_fulfillments rows where chef_id = the logged-in user.",
      where: "src/lib/skippe.server.ts → ownFulfillment() / set_order_status / chat tools",
      lines: "ownFulfillment helper and set_order_status case",
      fix: "Use an order that appears under this chef in list_orders. Admins still cannot claim another chef's fulfillment unless assigned.",
      message: text,
    };
  }

  // Generic
  return {
    title: "Skippe reported a problem",
    why: "A Skippe turn failed health checks (bad reply text, failed tools, or a thrown gateway error). See the raw message for the provider/DB detail.",
    where: "src/routes/staff.panda.tsx (send) → src/lib/panda.functions.ts (pandaChat) → src/lib/skippe.server.ts",
    lines: "staff.panda.tsx send(); detectSkippeProblem in lovable-error-reporting.ts",
    fix: "Copy the full error card. Fix the underlying tool/gateway/DB issue named in the message, then retry.",
    message: text,
  };
}

export function detectSkippeProblem(args: {
  reply: string;
  runs?: SkippeRunLike[] | null;
  model?: string | null;
  userMessage?: string | null;
}): string | null {
  const reply = (args.reply ?? "").trim();
  const runs = args.runs ?? [];

  if (!reply) {
    return "Empty reply from Skippe (no text after the model finished).";
  }

  for (const re of BAD_REPLY_PATTERNS) {
    if (re.test(reply)) {
      return reply.length > 240 ? `${reply.slice(0, 240)}…` : reply;
    }
  }

  if (runs.length > 0 && runs.every((r) => !r.ok)) {
    const first = runs[0];
    return `All ${runs.length} tool action(s) failed. First [${first.name}]: ${first.summary}${
      first.detail ? ` (${first.detail})` : ""
    }`;
  }

  const actionAsk =
    /\b(create|make|add|claim|mark|set|cancel|delete|remove|list|show|message|send|discount|order)\b/i;
  if (
    args.userMessage &&
    actionAsk.test(args.userMessage) &&
    runs.length === 0 &&
    reply.length < 80
  ) {
    return "Chef asked for an action but Skippe ran zero tools.";
  }

  return null;
}
