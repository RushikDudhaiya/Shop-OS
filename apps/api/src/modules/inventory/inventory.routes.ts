import { inventoryAdjustSchema } from "@shop-os/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { badRequest, notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { ProductModel } from "../products/product.model.js";
import { ShopModel } from "../shops/shop.model.js";
import { writeAudit } from "../audit/audit.model.js";
import { InventoryTransactionModel } from "./inventory-transaction.model.js";
import { getAvailableStock, getAvailableStockMap } from "./stock.js";

const OUT_TYPES = new Set([
  "SALE_OUT",
  "PURCHASE_RETURN_OUT",
  "MANUAL_ADJUSTMENT_OUT",
  "DAMAGE_OUT",
]);

export const inventoryRouter = Router({ mergeParams: true });

inventoryRouter.get(
  "/",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const lowOnly = req.query.low === "1" || req.query.low === "true";
      const [tracked, notTrackedCount] = await Promise.all([
        ProductModel.find({
          shopId,
          active: true,
          trackStock: true,
        })
          .sort({ name: 1 })
          .lean(),
        ProductModel.countDocuments({
          shopId,
          active: true,
          trackStock: false,
        }),
      ]);

      const stockMap = await getAvailableStockMap(
        shopId,
        tracked.map((p) => p._id),
      );

      const latestTx = await InventoryTransactionModel.aggregate<{
        _id: Types.ObjectId;
        lastAt: Date;
      }>([
        {
          $match: {
            shopId,
            productId: { $in: tracked.map((p) => p._id) },
            // Opening/CSV import = product add, purchase/sale nahi
            type: { $nin: ["OPENING_STOCK"] },
          },
        },
        { $group: { _id: "$productId", lastAt: { $max: "$createdAt" } } },
      ]);
      const lastMap = new Map(
        latestTx.map((t) => [String(t._id), t.lastAt?.toISOString?.() ?? null]),
      );

      let items = tracked.map((p) => {
        const availableStock = stockMap.get(String(p._id)) ?? 0;
        const minStock = p.minStock ?? 0;
        // Only use shop-configured minStock — no magic default threshold
        const status =
          availableStock <= 0
            ? ("out" as const)
            : minStock > 0 && availableStock <= minStock
              ? ("low" as const)
              : ("ok" as const);
        return {
          productId: String(p._id),
          name: p.name,
          unit: p.unit,
          minStock,
          availableStock,
          isLow: status === "low" || status === "out",
          status,
          sellingPrice: p.sellingPrice,
          purchasePrice: p.purchasePrice ?? null,
          imageUrl: p.imageUrl ?? null,
          // Sirf real movement (sale / purchase / adjust) — create time nahi
          updatedAt: lastMap.get(String(p._id)) ?? null,
        };
      });

      const summary = {
        totalTracked: tracked.length,
        lowStock: items.filter((i) => i.status === "low").length,
        outOfStock: items.filter((i) => i.status === "out").length,
        notTracked: notTrackedCount,
      };

      if (lowOnly) {
        items = items.filter((i) => i.status === "low" || i.status === "out");
      }

      res.json({
        items,
        summary,
        lowStockCount: summary.lowStock + summary.outOfStock,
      });
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/low-stock",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      req.query.low = "1";
      // reuse list with low filter inline
      const shopId = req.shopContext!.shopId;
      const products = await ProductModel.find({
        shopId,
        active: true,
        trackStock: true,
      }).lean();
      const stockMap = await getAvailableStockMap(
        shopId,
        products.map((p) => p._id),
      );
      const items = products
        .map((p) => {
          const availableStock = stockMap.get(String(p._id)) ?? 0;
          const minStock = p.minStock ?? 0;
          return {
            productId: String(p._id),
            name: p.name,
            unit: p.unit,
            minStock,
            availableStock,
            isLow: availableStock <= minStock,
            sellingPrice: p.sellingPrice,
          };
        })
        .filter((i) => i.isLow);

      res.json({ items, lowStockCount: items.length });
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.post(
  "/adjust",
  requireAuth,
  requireShopMember("inventory.adjust"),
  async (req, res, next) => {
    try {
      const body = inventoryAdjustSchema.parse(req.body);
      const shopId = req.shopContext!.shopId;

      if (!Types.ObjectId.isValid(body.productId)) {
        throw notFound("Product not found");
      }

      const product = await ProductModel.findOne({
        _id: body.productId,
        shopId,
        active: true,
      });
      if (!product) throw notFound("Product not found");
      if (!product.trackStock) {
        throw badRequest("Stock tracking is off for this product");
      }

      const shop = await ShopModel.findById(shopId);
      const allowNegative = Boolean(shop?.settings?.allowNegativeStock);

      let delta = body.quantityDelta;
      if (OUT_TYPES.has(body.type) && delta > 0) delta = -delta;
      if (!OUT_TYPES.has(body.type) && delta < 0) {
        // IN types should be positive unless STOCK_COUNT_ADJUSTMENT
        if (body.type !== "STOCK_COUNT_ADJUSTMENT") {
          delta = Math.abs(delta);
        }
      }

      const current = await getAvailableStock(shopId, product._id);
      const next = current + delta;
      if (!allowNegative && next < 0) {
        throw badRequest(
          `Stock negative nahi ho sakta (available ${current}, delta ${delta})`,
        );
      }

      const tx = await InventoryTransactionModel.create({
        shopId,
        productId: product._id,
        type: body.type,
        quantityDelta: delta,
        sourceType: "MANUAL_ADJUST",
        unitCost: body.unitCost,
        note: body.note,
        createdBy: req.user!._id,
      });

      await writeAudit({
        shopId,
        actorUserId: req.user!._id,
        action: "inventory.adjust",
        entityType: "Product",
        entityId: String(product._id),
        metadata: { type: body.type, delta, note: body.note },
      });

      res.status(201).json({
        transaction: {
          _id: String(tx._id),
          productId: String(product._id),
          type: tx.type,
          quantityDelta: tx.quantityDelta,
          note: tx.note ?? null,
          createdAt: tx.createdAt?.toISOString?.(),
        },
        availableStock: next,
        productName: product.name,
      });
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/:productId/transactions",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      if (!Types.ObjectId.isValid(req.params.productId)) {
        throw notFound("Product not found");
      }
      const product = await ProductModel.findOne({
        _id: req.params.productId,
        shopId,
      });
      if (!product) throw notFound("Product not found");

      const txs = await InventoryTransactionModel.find({
        shopId,
        productId: product._id,
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      const availableStock = await getAvailableStock(shopId, product._id);

      res.json({
        productId: String(product._id),
        name: product.name,
        availableStock,
        transactions: txs.map((t) => ({
          _id: String(t._id),
          type: t.type,
          quantityDelta: t.quantityDelta,
          sourceType: t.sourceType,
          note: t.note ?? null,
          createdAt: t.createdAt?.toISOString?.(),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);
