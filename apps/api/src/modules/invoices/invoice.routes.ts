import { phoneSchema } from "@shop-os/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { SaleModel } from "../sales/sale.model.js";
import {
  buildInvoicePayload,
  whatsappDeepLink,
} from "./invoice.service.js";
import { ShareJobModel } from "./share-job.model.js";

export const invoiceRouter = Router({ mergeParams: true });

invoiceRouter.get(
  "/:saleId/invoice",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      if (!Types.ObjectId.isValid(req.params.saleId)) {
        throw notFound("Sale not found");
      }
      const invoice = await buildInvoicePayload(
        req.shopContext!.shopId,
        new Types.ObjectId(req.params.saleId),
      );
      res.json({ invoice });
    } catch (err) {
      next(err);
    }
  },
);

const shareSchema = z.object({
  channel: z.enum(["WHATSAPP", "PRINT", "SKIP"]),
  phone: phoneSchema.optional(),
  /** Simulate provider failure — sale must still stay completed */
  simulateFailure: z.boolean().optional(),
});

/**
 * Queue share/print. Never rolls back the sale.
 * WhatsApp MVP = deep link; real provider can replace later.
 */
invoiceRouter.post(
  "/:saleId/share",
  requireAuth,
  requireShopMember("sale.create"),
  async (req, res, next) => {
    try {
      const body = shareSchema.parse(req.body);
      if (!Types.ObjectId.isValid(req.params.saleId)) {
        throw notFound("Sale not found");
      }

      const sale = await SaleModel.findOne({
        _id: req.params.saleId,
        shopId: req.shopContext!.shopId,
        status: "COMPLETED",
      });
      if (!sale) throw notFound("Completed sale not found");

      const invoice = await buildInvoicePayload(
        req.shopContext!.shopId,
        sale._id,
      );

      if (body.channel === "SKIP") {
        const job = await ShareJobModel.create({
          shopId: req.shopContext!.shopId,
          saleId: sale._id,
          channel: "SKIP",
          status: "SKIPPED",
          payloadSnapshot: { invoiceNumber: invoice.invoiceNumber },
          createdBy: req.user!._id,
        });
        res.status(201).json({
          ok: true,
          saleStatus: sale.status,
          job: { _id: String(job._id), status: job.status, channel: "SKIP" },
        });
        return;
      }

      if (body.channel === "PRINT") {
        const job = await ShareJobModel.create({
          shopId: req.shopContext!.shopId,
          saleId: sale._id,
          channel: "PRINT",
          status: "SENT",
          payloadSnapshot: { invoiceNumber: invoice.invoiceNumber },
          createdBy: req.user!._id,
        });
        res.status(201).json({
          ok: true,
          saleStatus: sale.status,
          job: { _id: String(job._id), status: job.status, channel: "PRINT" },
          invoice,
        });
        return;
      }

      // WHATSAPP
      const phone = body.phone ?? invoice.customer.phone;
      if (body.simulateFailure) {
        const job = await ShareJobModel.create({
          shopId: req.shopContext!.shopId,
          saleId: sale._id,
          channel: "WHATSAPP",
          status: "FAILED",
          phone: phone ?? undefined,
          errorMessage: "WhatsApp provider unavailable (simulated)",
          payloadSnapshot: { invoiceNumber: invoice.invoiceNumber },
          createdBy: req.user!._id,
        });
        // Sale untouched
        const still = await SaleModel.findById(sale._id);
        res.status(201).json({
          ok: false,
          code: "INVOICE_SHARE_FAILED",
          message: "WhatsApp bhej nahi paye — sale safe hai, retry karo.",
          saleStatus: still?.status,
          job: {
            _id: String(job._id),
            status: job.status,
            channel: "WHATSAPP",
          },
          whatsappUrl: null,
          invoice,
        });
        return;
      }

      const whatsappUrl = whatsappDeepLink(phone, invoice.textSummary);
      const job = await ShareJobModel.create({
        shopId: req.shopContext!.shopId,
        saleId: sale._id,
        channel: "WHATSAPP",
        status: "QUEUED",
        phone: phone ?? undefined,
        payloadSnapshot: {
          invoiceNumber: invoice.invoiceNumber,
          whatsappUrl,
        },
        createdBy: req.user!._id,
      });

      // MVP: mark SENT when deep-link handed to client (provider later)
      job.status = "SENT";
      await job.save();

      res.status(201).json({
        ok: true,
        saleStatus: sale.status,
        job: {
          _id: String(job._id),
          status: job.status,
          channel: "WHATSAPP",
        },
        whatsappUrl,
        invoice,
      });
    } catch (err) {
      next(err);
    }
  },
);
