import type { Request } from "express";
import type { Permission } from "@shop-os/shared";

export function canViewCost(req: Request): boolean {
  const ctx = req.shopContext;
  if (!ctx) return false;
  if (ctx.role === "OWNER") return true;
  return ctx.permissions.includes("cost.view" as Permission);
}

export function stripCostFields<T extends Record<string, unknown>>(
  product: T,
  allow: boolean,
): T {
  if (allow) return product;
  const { purchasePrice: _p, unitCostSnapshot: _u, ...rest } = product as T & {
    purchasePrice?: unknown;
    unitCostSnapshot?: unknown;
  };
  return rest as T;
}
