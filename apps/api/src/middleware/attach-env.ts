import type { Request, Response, NextFunction } from "express";
import type { Env } from "../lib/env.js";

declare global {
  namespace Express {
    interface Request {
      env: Env;
    }
  }
}

export function attachEnv(env: Env) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.env = env;
    next();
  };
}
