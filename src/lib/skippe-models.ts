/** Client-safe Skippe model catalogue (no server imports live here). */

export const SKIPPE_MODES = ["auto", "lite_25", "lite_31", "gpt5_nano"] as const;
export type SkippeMode = (typeof SKIPPE_MODES)[number];

export const MODEL_BY_MODE: Record<Exclude<SkippeMode, "auto">, string> = {
  gpt5_nano: "openai/gpt-5-nano",
  lite_25: "google/gemini-2.5-flash-lite",
  lite_31: "google/gemini-3.1-flash-lite",
};

export const SKIPPE_MODEL_LABELS: Record<string, string> = {
  "openai/gpt-5-nano": "GPT-5 Nano",
  "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
};

export type SkippeVendor = "openai" | "google";

export const MODEL_VENDOR: Record<string, SkippeVendor> = {
  "openai/gpt-5-nano": "openai",
  "google/gemini-2.5-flash-lite": "google",
  "google/gemini-3.1-flash-lite": "google",
};

/** Only the OpenAI path was wired for reasoning summaries (currently off server-side). */
export function modelShowsThinking(model: string): boolean {
  return MODEL_VENDOR[model] === "openai";
}

export const SKIPPE_MODE_OPTIONS: Array<{
  value: SkippeMode;
  label: string;
  cost: string;
  vendor: SkippeVendor;
  note: string;
  recommended?: boolean;
}> = [
  {
    value: "auto",
    label: "Auto",
    cost: "$-$$",
    vendor: "google",
    note: "Gemini 2.5 Flash Lite (escalates on big scans)",
    recommended: true,
  },
  {
    value: "lite_25",
    label: "Gemini 2.5 Flash Lite",
    cost: "$",
    vendor: "google",
    note: "Default — fast, cheap, kitchen-ready",
    recommended: true,
  },
  {
    value: "lite_31",
    label: "Gemini 3.1 Flash Lite",
    cost: "$$",
    vendor: "google",
    note: "Bigger photo / bulk batches",
  },
  {
    value: "gpt5_nano",
    label: "GPT-5 Nano",
    cost: "$$$",
    vendor: "openai",
    note: "Optional — stronger tool following",
  },
];
