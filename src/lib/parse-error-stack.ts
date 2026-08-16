/**
 * Turns a raw Error stack trace into structured frames so the dev error
 * screen can show exactly which file/line/column threw, instead of a
 * useless wall of text.
 */

export type ParsedStackFrame = {
  raw: string;
  functionName: string | null;
  file: string | null;
  line: number | null;
  column: number | null;
  /** True if this frame points at our own source (src/...), not a dependency */
  isAppFrame: boolean;
};

/**
 * Matches both common V8 stack frame shapes:
 *   "    at functionName (https://host/src/foo.tsx:12:34)"
 *   "    at https://host/src/foo.tsx:12:34"
 */
const FRAME_RE =
  /^\s*at\s+(?:(.*?)\s+\()?(.*?):(\d+):(\d+)\)?$/;

function cleanFile(file: string): string {
  // Strip origin so "https://app.example.com/src/foo.tsx" -> "src/foo.tsx"
  try {
    const url = new URL(file);
    return url.pathname.replace(/^\//, "");
  } catch {
    return file;
  }
}

export function parseErrorStack(
  error: Error | null | undefined,
): ParsedStackFrame[] {
  if (!error?.stack) return [];

  return error.stack
    .split("\n")
    .slice(1) // first line is "Name: message"
    .map((line): ParsedStackFrame | null => {
      const match = line.match(FRAME_RE);

      if (!match) {
        return {
          raw: line.trim(),
          functionName: null,
          file: null,
          line: null,
          column: null,
          isAppFrame: false,
        };
      }

      const [, fnName, rawFile, lineNo, colNo] = match;
      const file = cleanFile(rawFile);

      return {
        raw: line.trim(),
        functionName: fnName || null,
        file,
        line: Number(lineNo),
        column: Number(colNo),
        isAppFrame:
          file.includes("/src/") || file.startsWith("src/"),
      };
    })
    .filter((frame): frame is ParsedStackFrame => frame !== null);
}

/** First frame that points into our own src/ code — usually the actual bug */
export function findLikelySourceFrame(
  frames: ParsedStackFrame[],
): ParsedStackFrame | null {
  return frames.find((f) => f.isAppFrame && f.file) ?? frames[0] ?? null;
}

export function formatErrorForCopy(
  error: Error,
  frames: ParsedStackFrame[],
): string {
  const lines = [
    `${error.name}: ${error.message}`,
    "",
    ...frames.map((f) =>
      f.file
        ? `  at ${f.functionName ?? "(anonymous)"} — ${f.file}:${f.line}:${f.column}`
        : `  ${f.raw}`,
    ),
  ];

  return lines.join("\n");
}
