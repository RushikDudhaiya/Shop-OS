import {
  authStartSchema,
  authVerifySchema,
} from "@shop-os/shared";
import { Router } from "express";
import { badRequest, unauthorized } from "../../lib/errors.js";
import {
  generateOtp,
  generateSessionToken,
  hashValue,
  safeEqual,
} from "../../lib/crypto.js";
import {
  clearSessionCookie,
  setSessionCookie,
  THIRTY_DAYS_MS,
} from "../../lib/cookies.js";
import {
  requireAuth,
  SESSION_COOKIE,
} from "../../middleware/require-auth.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { MembershipModel } from "../memberships/membership.model.js";
import { ShopModel } from "../shops/shop.model.js";
import { OtpChallengeModel } from "./otp.model.js";
import { SessionModel } from "./session.model.js";
import { UserModel } from "./user.model.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export const authRouter = Router();

authRouter.post(
  "/auth/start",
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: "auth-start" }),
  async (req, res, next) => {
    try {
      const body = authStartSchema.parse(req.body);
      const otp = generateOtp(6);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);

      const challenge = await OtpChallengeModel.create({
        phone: body.phone,
        codeHash: hashValue(otp),
        expiresAt,
        attempts: 0,
      });

      // Keep this challenge valid even if another /auth/start races.
      // Client verifies with challengeId so the OTP shown on screen still works.

      // Never log OTP. Show on screen only in non-production OR when SHOW_LOGIN_OTP=true
      // (SMS provider not wired yet — needed for live demo/testing).
      const payload: {
        ok: true;
        phone: string;
        expiresInSec: number;
        challengeId: string;
        devOtp?: string;
      } = {
        ok: true,
        phone: body.phone,
        expiresInSec: Math.floor(OTP_TTL_MS / 1000),
        challengeId: String(challenge._id),
      };

      if (req.env.NODE_ENV !== "production" || req.env.SHOW_LOGIN_OTP) {
        payload.devOtp = otp;
      }

      res.json(payload);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  "/auth/verify",
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: "auth-verify" }),
  async (req, res, next) => {
    try {
      const body = authVerifySchema.parse(req.body);
      const otp = body.otp.trim();

      const challenge = body.challengeId
        ? await OtpChallengeModel.findOne({
            _id: body.challengeId,
            phone: body.phone,
            consumedAt: null,
            expiresAt: { $gt: new Date() },
          })
        : await OtpChallengeModel.findOne({
            phone: body.phone,
            consumedAt: null,
            expiresAt: { $gt: new Date() },
          }).sort({ createdAt: -1 });

      if (!challenge) {
        throw unauthorized("OTP expired. Request a new one.");
      }

      if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
        throw unauthorized("Too many attempts. Request a new OTP.");
      }

      const ok = safeEqual(challenge.codeHash, hashValue(otp));
      if (!ok) {
        challenge.attempts += 1;
        await challenge.save();
        throw unauthorized("Invalid OTP");
      }

      challenge.consumedAt = new Date();
      await challenge.save();

      let user = await UserModel.findOne({ phone: body.phone });
      if (!user) {
        user = await UserModel.create({
          phone: body.phone,
          isPhoneVerified: true,
        });
      } else if (!user.isPhoneVerified) {
        user.isPhoneVerified = true;
        await user.save();
      }

      const token = generateSessionToken();
      await SessionModel.create({
        userId: user._id,
        tokenHash: hashValue(token),
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
        userAgent: req.get("user-agent") ?? undefined,
        ip: req.ip,
      });

      setSessionCookie(res, req.env, token);

      const memberships = await MembershipModel.find({
        userId: user._id,
        status: "ACTIVE",
      }).lean();

      const shopIds = memberships.map((m) => m.shopId);
      const shops = await ShopModel.find({ _id: { $in: shopIds } }).lean();

      res.json({
        user: {
          _id: String(user._id),
          phone: user.phone,
          name: user.name ?? null,
          isPhoneVerified: user.isPhoneVerified,
        },
        shops: shops.map((s) => ({
          _id: String(s._id),
          name: s.name,
          businessType: s.businessType ?? null,
          role: memberships.find((m) => String(m.shopId) === String(s._id))
            ?.role,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post("/auth/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) {
      await SessionModel.updateOne(
        { tokenHash: hashValue(token), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }
    clearSessionCookie(res, req.env);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const memberships = await MembershipModel.find({
      userId: user._id,
      status: "ACTIVE",
    }).lean();
    const shops = await ShopModel.find({
      _id: { $in: memberships.map((m) => m.shopId) },
    }).lean();

    res.json({
      user: {
        _id: String(user._id),
        phone: user.phone,
        name: user.name ?? null,
        isPhoneVerified: user.isPhoneVerified,
      },
      shops: shops.map((s) => ({
        _id: String(s._id),
        name: s.name,
        businessType: s.businessType ?? null,
        role: memberships.find((m) => String(m.shopId) === String(s._id))?.role,
      })),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.patch("/auth/profile", requireAuth, async (req, res, next) => {
  try {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    if (!name || name.length < 1) {
      throw badRequest("Name is required", { name: ["Name is required"] });
    }
    const user = await UserModel.findByIdAndUpdate(
      req.user!._id,
      { $set: { name } },
      { new: true },
    );
    res.json({
      user: {
        _id: String(user!._id),
        phone: user!.phone,
        name: user!.name ?? null,
        isPhoneVerified: user!.isPhoneVerified,
      },
    });
  } catch (err) {
    next(err);
  }
});
