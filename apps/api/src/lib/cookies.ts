import type { CookieOptions, Response } from "express";
import type { Env } from "../lib/env.js";
import { SESSION_COOKIE } from "../middleware/require-auth.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_MS,
  };
}

export function setSessionCookie(res: Response, env: Env, token: string) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(env));
}

export function clearSessionCookie(res: Response, env: Env) {
  res.clearCookie(SESSION_COOKIE, {
    ...sessionCookieOptions(env),
    maxAge: undefined,
  });
}

export { THIRTY_DAYS_MS };
