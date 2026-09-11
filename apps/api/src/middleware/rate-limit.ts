import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Simple in-memory rate limit — auth / public endpoints */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.env?.NODE_ENV === "test") {
      next();
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${options.keyPrefix ?? "rl"}:${ip}:${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many requests. Thoda wait karo.",
      });
      return;
    }
    next();
  };
}
