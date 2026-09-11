import type { Request, Response, NextFunction } from "express";
import type { Permission } from "@shop-os/shared";
import { Types } from "mongoose";
import { forbidden, notFound } from "../lib/errors.js";
import { MembershipModel } from "../modules/memberships/membership.model.js";
import { ShopModel } from "../modules/shops/shop.model.js";
import type { ShopContext } from "./require-auth.js";

function shopIdFromReq(req: Request): string | undefined {
  return (
    (req.params.shopId as string | undefined) ??
    (req.headers["x-shop-id"] as string | undefined)
  );
}

export function requireShopMember(requiredPermission?: Permission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw forbidden("Login required");
      }

      const shopIdRaw = shopIdFromReq(req);
      if (!shopIdRaw || !Types.ObjectId.isValid(shopIdRaw)) {
        throw notFound("Shop not found");
      }

      const shopId = new Types.ObjectId(shopIdRaw);
      const shop = await ShopModel.findById(shopId).select("_id");
      if (!shop) {
        throw notFound("Shop not found");
      }

      const membership = await MembershipModel.findOne({
        shopId,
        userId: req.user._id,
        status: "ACTIVE",
      });

      if (!membership) {
        throw forbidden("You do not have access to this shop");
      }

      const permissions = membership.permissions as Permission[];
      if (
        requiredPermission &&
        !permissions.includes(requiredPermission) &&
        membership.role !== "OWNER"
      ) {
        throw forbidden("Permission denied");
      }

      const ctx: ShopContext = {
        shopId,
        role: membership.role as ShopContext["role"],
        permissions,
        membershipId: membership._id,
      };
      req.shopContext = ctx;
      next();
    } catch (err) {
      next(err);
    }
  };
}
