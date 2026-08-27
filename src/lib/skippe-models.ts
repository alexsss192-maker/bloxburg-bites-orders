/** Client-safe Skippe model catalogue (no server imports live here). */

export const SKIPPE_MODES = [
  "auto",
  "flash_25",
  "lite_31",
  "flash_3",
  "gpt5_nano",
  "gpt56_luna",
] as const;
export type SkippeMode = (typeof SKIPPE_MODES)[number];

export const MODEL_BY_MODE: Record<Exclude<SkippeMode, "auto">, string> = {
  flash_25: "google/gemini-2.5-flash",
  lite_31: "google/gemini-3.1-flash-lite",
  flash_3: "google/gemini-3-flash-preview",
  gpt5_nano: "openai/gpt-5-nano",
  gpt56_luna: "openai/gpt-5.6-luna",
};

export const SKIPPE_MODEL_LABELS: Record<string, string> = {
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
  "google/gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
  "google/gemini-3-flash-preview": "Gemini 3 Flash Preview",
  "openai/gpt-5-nano": "GPT-5 Nano",
  "openai/gpt-5.6-luna": "GPT-5.6 Luna",
};

export type SkippeVendor = "openai" | "google";

export const MODEL_VENDOR: Record<string, SkippeVendor> = {
  "google/gemini-2.5-flash": "google",
  "google/gemini-3.1-flash-lite": "google",
  "google/gemini-3-flash-preview": "google",
  "openai/gpt-5-nano": "openai",
  "openai/gpt-5.6-luna": "openai",
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
    cost: "$",
    vendor: "google",
    note: "2.5 Flash or 3.1 Flash Lite — full vision (share / screenshots / frames)",
    recommended: true,
  },
  {
    value: "flash_25",
    label: "Gemini 2.5 Flash",
    cost: "$$",
    vendor: "google",
    note: "Fast, full vision (share / screenshots / frames)",
    recommended: true,
  },
  {
    value: "lite_31",
    label: "Gemini 3.1 Flash Lite",
    cost: "$",
    vendor: "google",
    note: "Cheap — strong OCR, full vision (share / screenshots / frames)",
  },
  {
    value: "flash_3",
    label: "Gemini 3 Flash Preview",
    cost: "$$$",
    vendor: "google",
    note: "Preview — full vision (share / screenshots / frames)",
  },
  {
    value: "gpt5_nano",
    label: "GPT-5 Nano",
    cost: "$",
    vendor: "openai",
    note: "Optional — stronger tool following (no live fridge share)",
  },
  {
    value: "gpt56_luna",
    label: "GPT-5.6 Luna",
    cost: "$$",
    vendor: "openai",
    note: "Optional — stronger reasoning (no live fridge share)",
  },
];

/** Google vision modes: fridge share, screenshot, video frames. OpenAI models are chat/tools only. */
export function modeSupportsVisionCapture(mode: SkippeMode): boolean {
  return (
    mode === "auto" ||
    mode === "flash_25" ||
    mode === "lite_31" ||
    mode === "flash_3"
  );
}
