import { Router } from "express";
import { z } from "zod";
import { badRequest } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import {
  buildAutopilotDashboard,
  dismissAutopilotAlert,
  snoozeAutopilotAlert,
} from "./autopilot.service.js";

export const autopilotRouter = Router({ mergeParams: true });

autopilotRouter.get(
  "/",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const data = await buildAutopilotDashboard(shopId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

autopilotRouter.post(
  "/alerts/:alertKey/dismiss",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const alertKey = decodeURIComponent(req.params.alertKey ?? "");
      if (!alertKey) throw badRequest("Alert key required");
      await dismissAutopilotAlert(shopId, alertKey);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

autopilotRouter.post(
  "/alerts/:alertKey/snooze",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const alertKey = decodeURIComponent(req.params.alertKey ?? "");
      if (!alertKey) throw badRequest("Alert key required");
      const body = z
        .object({ hours: z.number().int().min(1).max(168).optional() })
        .parse(req.body ?? {});
      const snoozedUntil = await snoozeAutopilotAlert(
        shopId,
        alertKey,
        body.hours ?? 24,
      );
      res.json({ ok: true, snoozedUntil });
    } catch (err) {
      next(err);
    }
  },
);
