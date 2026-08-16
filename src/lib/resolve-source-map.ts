import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import type { ParsedStackFrame } from "./parse-error-stack";

export type ResolvedStackFrame = ParsedStackFrame & {
  /** True once we've attempted to resolve this frame against a sourcemap */
  resolved: boolean;
  /** Original (pre-build) file, if a sourcemap was found and mapped successfully */
  originalFile: string | null;
  originalLine: number | null;
  originalColumn: number | null;
  originalName: string | null;
};

const traceMapCache = new Map<string, TraceMap | null>();

async function loadTraceMap(fileUrl: string): Promise<TraceMap | null> {
  if (traceMapCache.has(fileUrl)) {
    return traceMapCache.get(fileUrl) ?? null;
  }

  try {
    const res = await fetch(`/${fileUrl}.map`);

    if (!res.ok) {
      traceMapCache.set(fileUrl, null);
      return null;
    }

    const map = await res.json();
    const traceMap = new TraceMap(map);

    traceMapCache.set(fileUrl, traceMap);
    return traceMap;
  } catch {
    traceMapCache.set(fileUrl, null);
    return null;
  }
}

/**
 * Given parsed (minified) stack frames, resolves each one against its
 * build's sourcemap so we can show the real src/*.tsx file, line, and
 * column instead of e.g. "assets/routes-DV4WiMqk.js:1:496".
 *
 * Falls back to the minified frame untouched if no sourcemap is found
 * (e.g. sourcemaps disabled, or the frame points at a 3rd-party script).
 */
export async function resolveStackFrames(
  frames: ParsedStackFrame[],
): Promise<ResolvedStackFrame[]> {
  return Promise.all(
    frames.map(async (frame): Promise<ResolvedStackFrame> => {
      const base: ResolvedStackFrame = {
        ...frame,
        resolved: false,
        originalFile: null,
        originalLine: null,
        originalColumn: null,
        originalName: null,
      };

      if (!frame.file || frame.line == null || frame.column == null) {
        return base;
      }

      // Only our own built assets have sourcemaps we control — skip
      // cross-origin / cdn / node_modules-style frames.
      if (!/\.[cm]?js$/.test(frame.file)) {
        return base;
      }

      const traceMap = await loadTraceMap(frame.file);

      if (!traceMap) {
        return base;
      }

      const original = originalPositionFor(traceMap, {
        line: frame.line,
        column: frame.column,
      });

      if (!original || original.source == null) {
        return { ...base, resolved: true };
      }

      return {
        ...base,
        resolved: true,
        originalFile: original.source,
        originalLine: original.line,
        originalColumn: original.column,
        originalName: original.name ?? frame.functionName,
      };
    }),
  );
}

/** Best "real source" frame to headline the error screen with. */
export function findLikelyResolvedSourceFrame(
  frames: ResolvedStackFrame[],
): ResolvedStackFrame | null {
  const withOriginal = frames.find(
    (f) => f.originalFile && f.originalFile.includes("/src/"),
  );

  if (withOriginal) return withOriginal;

  return frames.find((f) => f.isAppFrame) ?? frames[0] ?? null;
}
