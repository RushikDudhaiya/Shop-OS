import type { Request, Response, NextFunction } from "express";
import type { Permission, Role } from "@shop-os/shared";
import type { Types } from "mongoose";
import { unauthorized } from "../lib/errors.js";
import { hashValue } from "../lib/crypto.js";
import { SessionModel } from "../modules/auth/session.model.js";
import { UserModel } from "../modules/auth/user.model.js";

export const SESSION_COOKIE = "shop_os_session";

export type AuthUser = {
  _id: Types.ObjectId;
  phone: string;
  name?: string | null;
  isPhoneVerified: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: Types.ObjectId;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) {
      throw unauthorized("Login required");
    }

    const session = await SessionModel.findOne({
      tokenHash: hashValue(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      throw unauthorized("Session expired. Login again.");
    }

    const user = await UserModel.findById(session.userId);
    if (!user) {
      throw unauthorized("User not found");
    }

    req.user = {
      _id: user._id,
      phone: user.phone,
      name: user.name,
      isPhoneVerified: user.isPhoneVerified,
    };
    req.sessionId = session._id;
    next();
  } catch (err) {
    next(err);
  }
}

export type ShopContext = {
  shopId: Types.ObjectId;
  role: Role;
  permissions: Permission[];
  membershipId: Types.ObjectId;
};

declare global {
  namespace Express {
    interface Request {
      shopContext?: ShopContext;
    }
  }
}
