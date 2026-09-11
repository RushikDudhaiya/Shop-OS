import {
  BUSINESS_TYPES,
  DEFAULT_ROLE_PERMISSIONS,
  createShopSchema,
  membershipRoleSchema,
  updateShopProfileSchema,
  updateShopSettingsSchema,
} from "@shop-os/shared";
import { Router } from "express";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { MembershipModel } from "../memberships/membership.model.js";
import { UserModel } from "../auth/user.model.js";
import { writeAudit } from "../audit/audit.model.js";
import { ShopModel } from "./shop.model.js";

export const shopsRouter = Router();

shopsRouter.post("/shops", requireAuth, async (req, res, next) => {
  try {
    const body = createShopSchema.parse(req.body);
    const shop = await ShopModel.create({
      name: body.name,
      businessType: body.businessType,
      ownerUserId: req.user!._id,
      currency: "INR",
      settings: {
        simpleMode: true,
        allowNegativeStock: false,
        defaultPaymentMethod: "CASH",
        gstEnabled: false,
        ...body.settings,
      },
    });

    await MembershipModel.create({
      shopId: shop._id,
      userId: req.user!._id,
      role: "OWNER",
      permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER],
      status: "ACTIVE",
    });

    res.status(201).json({
      shop: serializeShop(shop),
      role: "OWNER",
    });
  } catch (err) {
    next(err);
  }
});

shopsRouter.get("/shops", requireAuth, async (req, res, next) => {
  try {
    const memberships = await MembershipModel.find({
      userId: req.user!._id,
      status: "ACTIVE",
    }).lean();
    const shops = await ShopModel.find({
      _id: { $in: memberships.map((m) => m.shopId) },
    }).lean();

    res.json({
      shops: shops.map((s) => ({
        ...serializeShop(s),
        role: memberships.find((m) => String(m.shopId) === String(s._id))?.role,
      })),
    });
  } catch (err) {
    next(err);
  }
});

shopsRouter.get(
  "/shops/:shopId",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shop = await ShopModel.findById(req.shopContext!.shopId);
      if (!shop) throw notFound("Shop not found");
      res.json({
        shop: serializeShop(shop),
        role: req.shopContext!.role,
        permissions: req.shopContext!.permissions,
      });
    } catch (err) {
      next(err);
    }
  },
);

shopsRouter.patch(
  "/shops/:shopId",
  requireAuth,
  requireShopMember("shop.settings"),
  async (req, res, next) => {
    try {
      const body = updateShopProfileSchema.parse(req.body);
      const shop = await ShopModel.findById(req.shopContext!.shopId);
      if (!shop) throw notFound("Shop not found");
      if (body.name) shop.name = body.name;
      if (body.businessType) shop.businessType = body.businessType;
      await shop.save();
      res.json({ shop: serializeShop(shop) });
    } catch (err) {
      next(err);
    }
  },
);

shopsRouter.patch(
  "/shops/:shopId/settings",
  requireAuth,
  requireShopMember("shop.settings"),
  async (req, res, next) => {
    try {
      const body = updateShopSettingsSchema.parse(req.body);
      const shop = await ShopModel.findById(req.shopContext!.shopId);
      if (!shop) throw notFound("Shop not found");
      shop.settings = {
        ...((shop.settings as object) ?? {}),
        ...body,
      } as typeof shop.settings;
      await shop.save();
      res.json({ shop: serializeShop(shop) });
    } catch (err) {
      next(err);
    }
  },
);

const addMemberSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/),
  role: membershipRoleSchema.default("CASHIER"),
  name: z.string().trim().min(1).max(120).optional(),
});

shopsRouter.post(
  "/shops/:shopId/members",
  requireAuth,
  requireShopMember("shop.settings"),
  async (req, res, next) => {
    try {
      const body = addMemberSchema.parse(req.body);
      if (body.role === "OWNER") {
        throw badRequest("Cannot assign OWNER via invite");
      }

      let user = await UserModel.findOne({ phone: body.phone });
      if (!user) {
        user = await UserModel.create({
          phone: body.phone,
          name: body.name,
          isPhoneVerified: false,
        });
      }

      const existing = await MembershipModel.findOne({
        shopId: req.shopContext!.shopId,
        userId: user._id,
      });
      if (existing) {
        throw conflict("User already a member of this shop");
      }

      const membership = await MembershipModel.create({
        shopId: req.shopContext!.shopId,
        userId: user._id,
        role: body.role,
        permissions: [...DEFAULT_ROLE_PERMISSIONS[body.role]],
        status: "ACTIVE",
      });

      res.status(201).json({
        membership: {
          _id: String(membership._id),
          shopId: String(membership.shopId),
          userId: String(membership.userId),
          role: membership.role,
          permissions: membership.permissions,
          status: membership.status,
          phone: user.phone,
          name: user.name ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

shopsRouter.get(
  "/shops/:shopId/members",
  requireAuth,
  requireShopMember("shop.settings"),
  async (req, res, next) => {
    try {
      if (
        req.shopContext!.role !== "OWNER" &&
        req.shopContext!.role !== "MANAGER"
      ) {
        throw forbidden("Only owner/manager can list staff");
      }
      const members = await MembershipModel.find({
        shopId: req.shopContext!.shopId,
        status: "ACTIVE",
      }).lean();
      const users = await UserModel.find({
        _id: { $in: members.map((m) => m.userId) },
      }).lean();

      res.json({
        members: members.map((m) => {
          const u = users.find((x) => String(x._id) === String(m.userId));
          return {
            _id: String(m._id),
            userId: String(m.userId),
            role: m.role,
            permissions: m.permissions,
            phone: u?.phone ?? null,
            name: u?.name ?? null,
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

shopsRouter.patch(
  "/shops/:shopId/members/:membershipId",
  requireAuth,
  requireShopMember("shop.settings"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          role: membershipRoleSchema.optional(),
          status: z.enum(["ACTIVE", "DISABLED"]).optional(),
        })
        .parse(req.body);

      const membership = await MembershipModel.findOne({
        _id: req.params.membershipId,
        shopId: req.shopContext!.shopId,
      });
      if (!membership) throw notFound("Member not found");
      if (membership.role === "OWNER" && body.role && body.role !== "OWNER") {
        throw badRequest("Owner role transfer not supported here");
      }
      if (body.role === "OWNER") {
        throw badRequest("Cannot promote to OWNER via this API");
      }

      const prev = { role: membership.role, status: membership.status };
      if (body.role) {
        membership.role = body.role;
        membership.permissions = [
          ...DEFAULT_ROLE_PERMISSIONS[body.role],
        ] as typeof membership.permissions;
      }
      if (body.status) membership.status = body.status;
      await membership.save();

      await writeAudit({
        shopId: req.shopContext!.shopId,
        actorUserId: req.user!._id,
        action: "membership.update",
        entityType: "Membership",
        entityId: String(membership._id),
        metadata: { prev, next: { role: membership.role, status: membership.status } },
      });

      res.json({
        membership: {
          _id: String(membership._id),
          role: membership.role,
          status: membership.status,
          permissions: membership.permissions,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

function serializeShop(shop: {
  _id: { toString(): string };
  name: string;
  businessType?: string | null;
  ownerUserId: { toString(): string };
  currency?: string;
  settings?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: String(shop._id),
    name: shop.name,
    businessType: shop.businessType ?? null,
    ownerUserId: String(shop.ownerUserId),
    currency: shop.currency ?? "INR",
    settings: shop.settings,
    createdAt: shop.createdAt?.toISOString?.() ?? undefined,
    updatedAt: shop.updatedAt?.toISOString?.() ?? undefined,
  };
}

export const businessTypes = BUSINESS_TYPES;
