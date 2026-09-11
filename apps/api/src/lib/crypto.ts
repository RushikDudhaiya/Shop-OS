import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOtp(length = 6): string {
  const max = 10 ** length;
  const n = randomInt(0, max);
  return String(n).padStart(length, "0");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
