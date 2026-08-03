// Verify cookie: signed httpOnly cookie storing the visitor's Discord identity.
import { createHmac, timingSafeEqual } from "node:crypto";

export const VERIFY_COOKIE = "pb_verified";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type VerifiedPayload = {
  discord_id: string;
  username: string;
  avatar_url: string | null;
  issued_at: number;
};

function b64urlEncode(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}

function sign(value: string, secret: string) {
  return b64urlEncode(createHmac("sha256", secret).update(value).digest());
}

export function signVerifiedPayload(payload: Omit<VerifiedPayload, "issued_at">) {
  const secret = process.env.PB_COOKIE_SECRET;
  if (!secret) throw new Error("PB_COOKIE_SECRET missing");
  const body: VerifiedPayload = { ...payload, issued_at: Date.now() };
  const encoded = b64urlEncode(JSON.stringify(body));
  const sig = sign(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifyPayload(token: string | null | undefined): VerifiedPayload | null {
  if (!token) return null;
  const secret = process.env.PB_COOKIE_SECRET;
  if (!secret) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = sign(encoded, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(encoded)) as VerifiedPayload;
    if (Date.now() - parsed.issued_at > MAX_AGE * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isCookieSecure(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.toLowerCase();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildSetCookie(token: string, request: Request) {
  const secure = isCookieSecure(request);
  const attributes = secure
    ? "; Secure; SameSite=None; Partitioned; Priority=High"
    : "; SameSite=Lax";
  return `${VERIFY_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${MAX_AGE}${attributes}`;
}
export function buildClearCookie(request: Request) {
  const secure = isCookieSecure(request);
  const attributes = secure
    ? "; Secure; SameSite=None; Partitioned; Priority=High"
    : "; SameSite=Lax";
  return `${VERIFY_COOKIE}=; Path=/; HttpOnly; Max-Age=0${attributes}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx > -1 && p.slice(0, idx) === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}
