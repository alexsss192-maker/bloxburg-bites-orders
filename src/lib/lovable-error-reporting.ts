import {
  diagnoseSecurityRisk,
  formatSecurityDiagnosisForCopy,
  type SecurityDiagnosis,
} from "./security-risk";
import { diagnoseBug } from "./bug-detector";

export type { SecurityDiagnosis };
export {
  diagnoseSecurityRisk,
  formatSecurityDiagnosisForCopy,
  isSecurityRiskError,
} from "./security-risk";
export {
  diagnoseBug,
  formatBugDiagnosisForCopy,
  bugSummary,
  installGlobalBugDetector,
} from "./bug-detector";

type LovableErrorOptions = {
  mechanism?:
    | "manual"
    | "onerror"
    | "unhandledrejection"
    | "react_error_boundary"
    | "skippe_health"
    | "security_risk";
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

  const security = diagnoseSecurityRisk(error);
  const bug = diagnoseBug(error);
  const handled = Boolean(context.handled);

  window.__lovableEvents?.captureException?.(
    error,
    {
      source: context.source ?? "react_error_boundary",
      route: window.location.pathname,
      security_risk: security?.isSecurityRisk ?? false,
      security_level: security?.level ?? null,
      security_title: security?.title ?? null,
      bug_family: bug?.family ?? null,
      bug_score: bug?.score ?? null,
      bug_fingerprint: bug?.fingerprint ?? null,
      confirmed_cause: bug?.confirmed.statement ?? null,
      confirmed_fix: bug?.confirmed.fix ?? null,
      confirmed_location: bug?.confirmed.location ?? null,
      ...context,
    },
    {
      mechanism: security?.isSecurityRisk
        ? "security_risk"
        : handled
          ? "manual"
          : "react_error_boundary",
      handled,
      severity: "error",
    },
  );

  if (bug) {
    console.warn(
      "[BugDetector]",
      bug.fingerprint,
      bug.confirmed.statement,
      "→",
      bug.confirmed.fix,
    );
  }

  return { bug, security };
}

/**
 * Zero-DB path for handled UI failures (mutations, forms, toasts).
 * Always runs bug-detector + security-risk, reports via Lovable, then returns
 * a user-facing message so callers can toast without swallowing diagnosis.
 */
export function reportHandledError(
  error: unknown,
  source: string,
  fallbackMessage = "Something went wrong",
): {
  message: string;
  fix: string | null;
  isSecurity: boolean;
} {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : fallbackMessage);

  const { bug, security } = reportLovableError(err, {
    source,
    handled: true,
  }) ?? { bug: null, security: null };

  return {
    message: err.message || fallbackMessage,
    fix: bug?.confirmed.fix ?? security?.fix ?? null,
    isSecurity: Boolean(security?.isSecurityRisk ?? bug?.isSecurityRelated),
  };
}

export function reportSecurityRisk(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (typeof window === "undefined") return;

  const security = diagnoseSecurityRisk(error);
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Security risk");
  if (!(error instanceof Error)) err.name = "SecurityRisk";

  window.__lovableEvents?.captureException?.(
    err,
    {
      source: "security_diagnosis",
      route: window.location.pathname,
      security_risk: true,
      security_level: security?.level ?? "medium",
      security_title: security?.title ?? "Security risk",
      security_fix: security?.fix ?? null,
      ...context,
    },
    {
      mechanism: "security_risk",
      handled: true,
      severity: security?.level === "critical" ? "error" : "warning",
    },
  );

  console.warn("[SecurityRisk]", security?.title ?? err.message, context);
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
  title: string;
  why: string;
  where: string;
  lines: string;
  fix: string;
  message: string;
};

export function diagnoseSkippeFailure(raw: string): SkippeDiagnosis {
  const text = raw || "Unknown Skippe failure";

  const bug = diagnoseBug(text);
  if (bug && bug.confidence >= 0.55) {
    return {
      title: bug.title,
      why: bug.confirmed.statement,
      where: bug.confirmed.location || bug.features.primaryFile || "skippe / runtime",
      lines: `family=${bug.family} score=${bug.score} fp=${bug.fingerprint}`,
      fix: bug.confirmed.fix,
      message: text,
    };
  }

  const security = diagnoseSecurityRisk(text);
  if (security && /schema cache|row-level|permission denied|forbidden|401|403/i.test(text)) {
    return {
      title: security.title,
      why: security.why,
      where: security.where,
      lines: `Security level: ${security.level}`,
      fix: security.fix,
      message: text,
    };
  }

  if (/bulk_service_fees|fee_message|set_bulk_service_fee/i.test(text)) {
    return {
      title: "Bulk / Fast Service fee table or column missing",
      why: "Skippe set_bulk_service_fee needs public.bulk_service_fees (and column fee_message). Those objects live in later migrations that may not be applied on Lovable Cloud.",
      where: "src/lib/skippe.server.ts → set_bulk_service_fee · supabase/migrations",
      lines: "runSkippeTool case set_bulk_service_fee",
      fix: "1) Create public.bulk_service_fees + bulk_service_eligible_chefs. 2) ADD COLUMN fee_message if needed. 3) NOTIFY pgrst, 'reload schema'; 4) Retry.",
      message: text,
    };
  }

  if (/schema cache|could not find the table.*discounts/i.test(text)) {
    return {
      title: "Discount table missing or wrong name",
      why: "Skippe tried to read/write a discounts table that PostgREST does not know. Live table is public.chef_discounts.",
      where: "src/lib/skippe.server.ts → create_discount / list_discounts",
      lines: "from(\"chef_discounts\")",
      fix: "Use .from(\"chef_discounts\"), ensure table exists, NOTIFY pgrst, 'reload schema';",
      message: text,
    };
  }

  if (/LOVABLE_API_KEY|auth failed \(401\)|Missing API key/i.test(text)) {
    return {
      title: "Skippe cannot authenticate to Lovable AI gateway",
      why: "LOVABLE_API_KEY is missing or invalid in the server environment.",
      where: "src/lib/skippe.server.ts → gatewayKey()",
      lines: "gatewayKey()",
      fix: "Cloud → Secrets → ensure LOVABLE_API_KEY exists. Redeploy.",
      message: text,
    };
  }

  if (/model is not supported on \/v1\/responses/i.test(text)) {
    return {
      title: "Wrong AI endpoint for this model",
      why: "/v1/responses only accepts OpenAI models. Gemini must use /v1/chat/completions.",
      where: "src/lib/skippe.server.ts → runGoogleTurn / runOpenAiTurn",
      lines: "vendor routing",
      fix: "Google → chat/completions; OpenAI → responses.",
      message: text,
    };
  }

  if (/404 page not found|skippe gateway 404/i.test(text)) {
    return {
      title: "AI gateway path not found",
      why: "Request hit a URL the gateway does not serve.",
      where: "src/lib/skippe.server.ts fetch paths",
      lines: "OpenAI: /v1/responses · Google: /v1/chat/completions",
      fix: "Use only those two paths.",
      message: text,
    };
  }

  if (/zero tools|ran zero tools/i.test(text)) {
    return {
      title: "Model replied without calling any kitchen tools",
      why: "LLM answered in plain text and skipped function calls.",
      where: "src/lib/skippe.server.ts tool loop",
      lines: "tool loop + maybeRunIntentFallback",
      fix: "Retry with clearer action wording; try stronger tool-use model.",
      message: text,
    };
  }

  if (/empty reply/i.test(text)) {
    return {
      title: "Empty assistant reply after the model finished",
      why: "Gateway returned no assistant text.",
      where: "skippe.server.ts / panda.functions.ts",
      lines: "synthesizeReplyFromRuns",
      fix: "Check gateway status and model.",
      message: text,
    };
  }

  if (/create_discount failed|couldn't create the discount/i.test(text)) {
    return {
      title: "create_discount tool failed",
      why: "Supabase rejected insert/update (permissions, schema, constraint, or RLS).",
      where: "src/lib/skippe.server.ts → create_discount",
      lines: "Insert into chef_discounts",
      fix: "Check RLS on chef_discounts and required columns.",
      message: text,
    };
  }

  if (/not assigned to you/i.test(text)) {
    return {
      title: "Order is not assigned to this chef",
      why: "Skippe only mutates fulfillments where chef_id = logged-in user.",
      where: "src/lib/skippe.server.ts → ownFulfillment",
      lines: "ownFulfillment / set_order_status",
      fix: "Use an order assigned to this chef.",
      message: text,
    };
  }

  return {
    title: "Skippe reported a problem",
    why: "Skippe turn failed health checks. See raw message.",
    where: "staff.panda.tsx → panda.functions.ts → skippe.server.ts",
    lines: "detectSkippeProblem",
    fix: "Copy full error; fix underlying tool/gateway/DB issue; retry.",
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
