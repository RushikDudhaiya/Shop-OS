import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { CustomerModel } from "../customers/customer.model.js";
import { parseRange } from "../expenses/expenses.routes.js";
import { MembershipModel } from "../memberships/membership.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import {
  applyPaymentToSale,
  createSaleForShop,
  loadSaleBundle,
  roundMoney,
  serializeSale,
} from "./sale.service.js";
import { SaleItemModel } from "./sale-item.model.js";
import { SaleModel } from "./sale.model.js";

export const salesRouter = Router({ mergeParams: true });

salesRouter.post(
  "/",
  requireAuth,
  requireShopMember("sale.create"),
  async (req, res, next) => {
    try {
      const result = await createSaleForShop({
        shopId: req.shopContext!.shopId,
        userId: req.user!._id,
        body: req.body,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

salesRouter.get(
  "/",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number(req.query.pageSize) || 8),
      );
      const q =
        typeof req.query.q === "string" ? req.query.q.trim() : "";
      const customerIdRaw =
        typeof req.query.customerId === "string"
          ? req.query.customerId.trim()
          : "";

      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      defaultFrom.setHours(0, 0, 0, 0);
      const defaultTo = new Date(now);
      defaultTo.setHours(23, 59, 59, 999);

      const parsed = parseRange(req.query.from, req.query.to);
      const from = parsed.from ?? defaultFrom;
      const to = parsed.to ?? defaultTo;

      const filter: Record<string, unknown> = {
        shopId,
        status: "COMPLETED",
        completedAt: { $gte: from, $lte: to },
      };

      if (customerIdRaw && Types.ObjectId.isValid(customerIdRaw)) {
        filter.customerId = new Types.ObjectId(customerIdRaw);
      }

      if (q) {
        const matchingCustomers = await CustomerModel.find({
          shopId,
          name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
        })
          .select("_id")
          .lean();
        const customerIds = matchingCustomers.map((c) => c._id);
        filter.$or = [
          { invoiceNumber: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          ...(customerIds.length
            ? [{ customerId: { $in: customerIds } }]
            : []),
        ];
      }

      const [items, total, summaryRows] = await Promise.all([
        SaleModel.find(filter)
          .sort({ completedAt: -1, createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .populate("customerId", "name")
          .lean(),
        SaleModel.countDocuments(filter),
        SaleModel.aggregate<{
          total: number;
          count: number;
          customers: Types.ObjectId[];
          itemsSold: number;
        }>([
          { $match: filter },
          {
            $lookup: {
              from: "saleitems",
              localField: "_id",
              foreignField: "saleId",
              as: "lines",
            },
          },
          {
            $addFields: {
              lineQty: { $sum: "$lines.quantity" },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$total" },
              count: { $sum: 1 },
              customers: { $addToSet: "$customerId" },
              itemsSold: { $sum: "$lineQty" },
            },
          },
        ]),
      ]);

      const saleIds = items.map((s) => s._id);
      const [lineCounts, payments] = await Promise.all([
        saleIds.length
          ? SaleItemModel.aggregate<{
              _id: Types.ObjectId;
              count: number;
              qty: number;
            }>([
              { $match: { saleId: { $in: saleIds } } },
              {
                $group: {
                  _id: "$saleId",
                  count: { $sum: 1 },
                  qty: { $sum: "$quantity" },
                },
              },
            ])
          : Promise.resolve([]),
        saleIds.length
          ? PaymentModel.find({
              saleId: { $in: saleIds },
              status: "CONFIRMED",
            })
              .sort({ amount: -1 })
              .lean()
          : Promise.resolve([]),
      ]);

      const countBySale = new Map(
        lineCounts.map((r) => [
          String(r._id),
          { count: r.count, qty: r.qty },
        ]),
      );
      const paymentBySale = new Map<string, string>();
      for (const pay of payments) {
        const key = String(pay.saleId);
        if (!paymentBySale.has(key)) {
          paymentBySale.set(key, pay.method);
        }
      }

      const summaryAgg = summaryRows[0];
      const salesTotal = roundMoney(summaryAgg?.total ?? 0);
      const salesCount = summaryAgg?.count ?? 0;
      const customerSet = (summaryAgg?.customers ?? []).filter(Boolean);
      const avgBill =
        salesCount > 0 ? roundMoney(salesTotal / salesCount) : 0;

      res.json({
        range: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          salesTotal,
          salesCount,
          avgBill,
          customerCount: customerSet.length,
          itemsSold: roundMoney(summaryAgg?.itemsSold ?? 0),
        },
        items: items.map((sale) => {
          const customerDoc = sale.customerId as
            | { _id: Types.ObjectId; name?: string }
            | Types.ObjectId
            | null
            | undefined;
          const customerName =
            customerDoc &&
            typeof customerDoc === "object" &&
            "name" in customerDoc &&
            typeof customerDoc.name === "string"
              ? customerDoc.name
              : null;
          const customerIdValue =
            customerDoc &&
            typeof customerDoc === "object" &&
            "_id" in customerDoc
              ? String(customerDoc._id)
              : customerDoc
                ? String(customerDoc)
                : null;
          const counts = countBySale.get(String(sale._id));
          let paymentMethod =
            paymentBySale.get(String(sale._id)) ?? null;
          if (!paymentMethod && sale.amountDue > 0) {
            paymentMethod = "CREDIT";
          }
          if (!paymentMethod && sale.amountPaid > 0) {
            paymentMethod = "CASH";
          }
          return {
            ...serializeSale({
              ...sale,
              customerId: customerIdValue
                ? { toString: () => customerIdValue }
                : null,
            }),
            customerName,
            itemCount: counts?.count ?? 0,
            itemsQty: counts?.qty ?? 0,
            paymentMethod,
          };
        }),
        page,
        pageSize,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

salesRouter.get(
  "/:saleId",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      if (!Types.ObjectId.isValid(req.params.saleId)) {
        throw notFound("Sale not found");
      }
      const bundle = await loadSaleBundle(
        new Types.ObjectId(req.params.saleId),
        req.shopContext!.shopId,
      );
      res.json(bundle);
    } catch (err) {
      next(err);
    }
  },
);

salesRouter.post(
  "/:saleId/payments",
  requireAuth,
  requireShopMember("sale.create"),
  async (req, res, next) => {
    try {
      if (!Types.ObjectId.isValid(req.params.saleId)) {
        throw notFound("Sale not found");
      }
      const result = await applyPaymentToSale({
        shopId: req.shopContext!.shopId,
        saleId: new Types.ObjectId(req.params.saleId),
        userId: req.user!._id,
        raw: req.body,
      });
      const bundle = await loadSaleBundle(
        new Types.ObjectId(req.params.saleId),
        req.shopContext!.shopId,
      );
      res.status(201).json({
        ...bundle,
        change: result.changeGiven,
        receivedAmount: result.receivedAmount,
        payment: result.payment,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Spec: GET /api/sales/:id — membership checked against sale.shopId */
export const saleDetailRouter = Router();

saleDetailRouter.get(
  "/sales/:saleId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Types.ObjectId.isValid(req.params.saleId)) {
        throw notFound("Sale not found");
      }
      const sale = await SaleModel.findById(req.params.saleId);
      if (!sale) throw notFound("Sale not found");

      const membership = await MembershipModel.findOne({
        shopId: sale.shopId,
        userId: req.user!._id,
        status: "ACTIVE",
      });
      if (!membership) {
        throw notFound("Sale not found");
      }

      const bundle = await loadSaleBundle(sale._id, sale.shopId);
      res.json(bundle);
    } catch (err) {
      next(err);
    }
  },
);