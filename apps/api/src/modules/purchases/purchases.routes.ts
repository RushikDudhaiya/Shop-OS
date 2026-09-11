import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { writeAudit } from "../audit/audit.model.js";
import { InventoryTransactionModel } from "../inventory/inventory-transaction.model.js";
import { ProductModel } from "../products/product.model.js";
import { roundMoney } from "../sales/sale.service.js";
import {
  PurchaseItemModel,
  PurchaseModel,
  SupplierModel,
} from "./purchase.models.js";

export const suppliersRouter = Router({ mergeParams: true });
export const purchasesRouter = Router({ mergeParams: true });

suppliersRouter.get(
  "/",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      const items = await SupplierModel.find({
        shopId: req.shopContext!.shopId,
        active: true,
      })
        .sort({ name: 1 })
        .lean();
      res.json({
        suppliers: items.map((s) => ({
          _id: String(s._id),
          name: s.name,
          phone: s.phone ?? null,
          address: s.address ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

suppliersRouter.post(
  "/",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(1).max(120),
          phone: z.string().trim().max(15).optional(),
          address: z.string().trim().max(300).optional(),
        })
        .parse(req.body);
      const s = await SupplierModel.create({
        shopId: req.shopContext!.shopId,
        ...body,
        active: true,
      });
      res.status(201).json({
        supplier: {
          _id: String(s._id),
          name: s.name,
          phone: s.phone ?? null,
          address: s.address ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const createPurchaseSchema = z.object({
  supplierId: z.string().optional(),
  note: z.string().max(500).optional(),
  items: z.array(purchaseItemSchema).min(1),
});

purchasesRouter.get(
  "/",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const endOfLastMonth = new Date(startOfMonth.getTime() - 1);

      const [purchases, monthAgg, lastMonthAgg, purchaseCount, supplierCount] =
        await Promise.all([
          PurchaseModel.find({ shopId })
            .sort({ purchasedAt: -1 })
            .limit(50)
            .populate("supplierId", "name")
            .lean(),
          PurchaseModel.aggregate<{ total: number }>([
            {
              $match: {
                shopId,
                status: "COMPLETED",
                purchasedAt: { $gte: startOfMonth },
              },
            },
            { $group: { _id: null, total: { $sum: "$total" } } },
          ]),
          PurchaseModel.aggregate<{ total: number }>([
            {
              $match: {
                shopId,
                status: "COMPLETED",
                purchasedAt: {
                  $gte: startOfLastMonth,
                  $lte: endOfLastMonth,
                },
              },
            },
            { $group: { _id: null, total: { $sum: "$total" } } },
          ]),
          PurchaseModel.countDocuments({ shopId, status: "COMPLETED" }),
          SupplierModel.countDocuments({ shopId, active: true }),
        ]);

      const purchaseIds = purchases.map((p) => p._id);
      const allItems = purchaseIds.length
        ? await PurchaseItemModel.find({
            purchaseId: { $in: purchaseIds },
          }).lean()
        : [];
      const itemsByPurchase = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const key = String(item.purchaseId);
        const list = itemsByPurchase.get(key) ?? [];
        list.push(item);
        itemsByPurchase.set(key, list);
      }

      const monthTotal = roundMoney(monthAgg[0]?.total ?? 0);
      const lastMonthTotal = roundMoney(lastMonthAgg[0]?.total ?? 0);
      let monthGrowthPct: number | null = null;
      if (lastMonthTotal > 0) {
        monthGrowthPct = roundMoney(
          ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100,
        );
      } else if (monthTotal > 0) {
        monthGrowthPct = 100;
      }

      res.json({
        summary: {
          monthTotal,
          lastMonthTotal,
          monthGrowthPct,
          purchaseCount,
          supplierCount,
        },
        purchases: purchases.map((p) => {
          const supplierDoc = p.supplierId as
            | { _id: Types.ObjectId; name?: string }
            | Types.ObjectId
            | null
            | undefined;
          const supplierName =
            supplierDoc &&
            typeof supplierDoc === "object" &&
            "name" in supplierDoc &&
            typeof supplierDoc.name === "string"
              ? supplierDoc.name
              : null;
          const supplierIdValue =
            supplierDoc &&
            typeof supplierDoc === "object" &&
            "_id" in supplierDoc
              ? String(supplierDoc._id)
              : supplierDoc
                ? String(supplierDoc)
                : null;
          const lines = itemsByPurchase.get(String(p._id)) ?? [];
          return {
            _id: String(p._id),
            supplierId: supplierIdValue,
            supplierName,
            status: p.status,
            total: p.total,
            purchasedAt: p.purchasedAt?.toISOString?.() ?? null,
            note: p.note ?? null,
            itemCount: lines.length,
            items: lines.map((i) => ({
              name: i.productNameSnapshot,
              quantity: i.quantity,
              unitCost: i.unitCost,
              lineTotal: i.lineTotal,
            })),
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

purchasesRouter.get(
  "/last-for-product/:productId",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const productId = String(req.params.productId ?? "");
      if (!Types.ObjectId.isValid(productId)) {
        throw badRequest("Invalid productId");
      }

      const product = await ProductModel.findOne({
        _id: productId,
        shopId,
      }).lean();
      if (!product) throw notFound("Product not found");

      const lastItem = await PurchaseItemModel.aggregate<{
        quantity: number;
        unitCost: number;
        purchaseId: Types.ObjectId;
        purchasedAt: Date;
        supplierId?: Types.ObjectId | null;
      }>([
        { $match: { productId: new Types.ObjectId(productId) } },
        {
          $lookup: {
            from: "purchases",
            localField: "purchaseId",
            foreignField: "_id",
            as: "purchase",
          },
        },
        { $unwind: "$purchase" },
        {
          $match: {
            "purchase.shopId": shopId,
            "purchase.status": "COMPLETED",
          },
        },
        { $sort: { "purchase.purchasedAt": -1 } },
        { $limit: 1 },
        {
          $project: {
            quantity: 1,
            unitCost: 1,
            purchaseId: 1,
            purchasedAt: "$purchase.purchasedAt",
            supplierId: "$purchase.supplierId",
          },
        },
      ]);

      const row = lastItem[0];
      if (!row) {
        res.json({
          lastPurchase: null,
          product: {
            _id: String(product._id),
            name: product.name,
            purchasePrice: product.purchasePrice ?? null,
          },
        });
        return;
      }

      res.json({
        lastPurchase: {
          quantity: row.quantity,
          unitCost: row.unitCost,
          supplierId: row.supplierId ? String(row.supplierId) : null,
          purchasedAt: row.purchasedAt?.toISOString?.() ?? null,
        },
        product: {
          _id: String(product._id),
          name: product.name,
          purchasePrice: product.purchasePrice ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

purchasesRouter.post(
  "/",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      const body = createPurchaseSchema.parse(req.body);
      const shopId = req.shopContext!.shopId;

      const products = await ProductModel.find({
        _id: { $in: body.items.map((i) => i.productId) },
        shopId,
      });
      const byId = new Map(products.map((p) => [String(p._id), p]));

      const lines = body.items.map((item) => {
        const product = byId.get(item.productId);
        if (!product) throw badRequest(`Product missing: ${item.productId}`);
        return {
          productId: product._id,
          productNameSnapshot: product.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          lineTotal: roundMoney(item.quantity * item.unitCost),
          trackStock: product.trackStock,
        };
      });

      const total = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));

      const purchase = await PurchaseModel.create({
        shopId,
        supplierId: body.supplierId
          ? new Types.ObjectId(body.supplierId)
          : undefined,
        status: "COMPLETED",
        total,
        purchasedAt: new Date(),
        note: body.note,
        createdBy: req.user!._id,
      });

      await PurchaseItemModel.insertMany(
        lines.map((l) => ({
          purchaseId: purchase._id,
          productId: l.productId,
          productNameSnapshot: l.productNameSnapshot,
          quantity: l.quantity,
          unitCost: l.unitCost,
          lineTotal: l.lineTotal,
        })),
      );

      const stockDocs = lines
        .filter((l) => l.trackStock)
        .map((l) => ({
          shopId,
          productId: l.productId,
          type: "PURCHASE_IN" as const,
          quantityDelta: l.quantity,
          sourceType: "PURCHASE",
          sourceId: purchase._id,
          unitCost: l.unitCost,
          createdBy: req.user!._id,
        }));
      if (stockDocs.length) {
        await InventoryTransactionModel.insertMany(stockDocs);
      }

      // update purchase prices when cost known
      for (const line of lines) {
        await ProductModel.updateOne(
          { _id: line.productId },
          { $set: { purchasePrice: line.unitCost } },
        );
      }

      await writeAudit({
        shopId,
        actorUserId: req.user!._id,
        action: "purchase.create",
        entityType: "Purchase",
        entityId: String(purchase._id),
        metadata: { total, itemCount: lines.length },
      });

      res.status(201).json({
        purchase: {
          _id: String(purchase._id),
          total: purchase.total,
          status: purchase.status,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

purchasesRouter.get(
  "/:purchaseId",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      if (!Types.ObjectId.isValid(req.params.purchaseId)) {
        throw notFound("Purchase not found");
      }
      const purchase = await PurchaseModel.findOne({
        _id: req.params.purchaseId,
        shopId: req.shopContext!.shopId,
      });
      if (!purchase) throw notFound("Purchase not found");
      const items = await PurchaseItemModel.find({
        purchaseId: purchase._id,
      }).lean();
      res.json({
        purchase: {
          _id: String(purchase._id),
          total: purchase.total,
          status: purchase.status,
          purchasedAt: purchase.purchasedAt?.toISOString?.(),
        },
        items: items.map((i) => ({
          productId: String(i.productId),
          name: i.productNameSnapshot,
          quantity: i.quantity,
          unitCost: i.unitCost,
          lineTotal: i.lineTotal,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);
