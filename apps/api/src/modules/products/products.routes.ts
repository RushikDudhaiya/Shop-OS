import {
  createCategorySchema,
  createProductSchema,
  updateProductSchema,
} from "@shop-os/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { escapeRegex, normalizeProductName } from "../../lib/normalize.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { canViewCost } from "../../lib/privacy.js";
import { writeAudit } from "../audit/audit.model.js";
import { InventoryTransactionModel } from "../inventory/inventory-transaction.model.js";
import { getAvailableStock, getAvailableStockMap } from "../inventory/stock.js";
import { ProductCategoryModel } from "./category.model.js";
import { ProductModel } from "./product.model.js";
import { suggestProductImage } from "./suggest-image.js";

export const productsRouter = Router({ mergeParams: true });

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
  favorites: z
    .enum(["1", "true", "0", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  active: z
    .enum(["1", "true", "0", "false", "all"])
    .optional()
    .transform((v) => {
      if (v === undefined) return true as const;
      if (v === "all") return "all" as const;
      return v === "1" || v === "true";
    }),
});

productsRouter.get(
  "/",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const shopId = req.shopContext!.shopId;
      const filter: Record<string, unknown> = {
        shopId,
      };
      if (query.active !== "all") {
        filter.active = query.active;
      }

      if (query.favorites) filter.isFavorite = true;

      if (query.q) {
        const normalized = normalizeProductName(query.q);
        const rx = new RegExp(escapeRegex(normalized || query.q), "i");
        filter.$or = [
          { normalizedName: rx },
          { name: new RegExp(escapeRegex(query.q), "i") },
          { barcode: query.q },
        ];
      }

      const skip = (query.page - 1) * query.pageSize;
      const [items, total] = await Promise.all([
        ProductModel.find(filter)
          .sort(query.favorites ? { name: 1 } : { updatedAt: -1 })
          .skip(skip)
          .limit(query.pageSize)
          .lean(),
        ProductModel.countDocuments(filter),
      ]);

      const stockMap = await getAvailableStockMap(
        shopId,
        items.map((p) => p._id),
      );

      const suggestions =
        query.q && items.length === 0
          ? await findDuplicateSuggestions(shopId, query.q)
          : [];

      const allowCost = canViewCost(req);
      res.json({
        items: items.map((p) =>
          serializeProduct(p, stockMap.get(String(p._id)) ?? 0, allowCost),
        ),
        page: query.page,
        pageSize: query.pageSize,
        total,
        suggestions: suggestions.map((p) =>
          serializeProduct(p, stockMap.get(String(p._id)) ?? 0, allowCost),
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  "/",
  requireAuth,
  requireShopMember("product.create"),
  async (req, res, next) => {
    try {
      const body = createProductSchema.parse(req.body);
      const shopId = req.shopContext!.shopId;
      const normalizedName = normalizeProductName(body.name);

      const duplicates = await findDuplicateSuggestions(shopId, body.name);
      const force = req.query.force === "1" || req.body?.force === true;

      if (duplicates.length && !force) {
        const exact = duplicates.find((d) => d.normalizedName === normalizedName);
        if (exact) {
          throw conflict(
            `Product "${exact.name}" already exists. Pass force=true to create anyway.`,
          );
        }
      }

      if (body.barcode) {
        const barcodeHit = await ProductModel.findOne({
          shopId,
          barcode: body.barcode,
        }).lean();
        if (barcodeHit) {
          throw conflict("Barcode already used by another product");
        }
      }

      const imageUrl =
        body.imageUrl?.trim() ||
        (await suggestProductImage({
          name: body.name,
          barcode: body.barcode,
        })) ||
        undefined;

      const product = await ProductModel.create({
        shopId,
        name: body.name.trim(),
        normalizedName,
        categoryId: body.categoryId
          ? new Types.ObjectId(body.categoryId)
          : undefined,
        sku: body.sku,
        barcode: body.barcode || undefined,
        unit: body.unit,
        sellingPrice: body.sellingPrice,
        purchasePrice: body.purchasePrice,
        mrp: body.mrp,
        trackStock: body.trackStock,
        minStock: body.minStock,
        isFavorite: body.isFavorite ?? false,
        active: true,
        imageUrl,
      });

      if (
        body.trackStock &&
        body.openingStock !== undefined &&
        body.openingStock > 0
      ) {
        await InventoryTransactionModel.create({
          shopId,
          productId: product._id,
          type: "OPENING_STOCK",
          quantityDelta: body.openingStock,
          sourceType: "PRODUCT_CREATE",
          sourceId: product._id,
          unitCost: body.purchasePrice,
          createdBy: req.user!._id,
        });
      }

      const stock = await getAvailableStock(shopId, product._id);
      const allowCost = canViewCost(req);
      res.status(201).json({
        product: serializeProduct(product.toObject(), stock, allowCost),
        duplicateSuggestions: duplicates
          .filter((d) => String(d._id) !== String(product._id))
          .slice(0, 5)
          .map((d) => serializeProduct(d, 0, allowCost)),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  "/import/preview",
  requireAuth,
  requireShopMember("product.create"),
  async (req, res, next) => {
    try {
      const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
      if (!csv.trim()) throw badRequest("CSV text required");
      const preview = previewCsvProducts(csv);
      res.json(preview);
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  "/import",
  requireAuth,
  requireShopMember("product.create"),
  async (req, res, next) => {
    try {
      const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
      if (!csv.trim()) throw badRequest("CSV text required");
      const preview = previewCsvProducts(csv);
      if (preview.errors.length && !req.body?.forceInvalid) {
        res.status(400).json({
          code: "IMPORT_VALIDATION",
          message: "Fix validation errors before import",
          ...preview,
        });
        return;
      }

      const shopId = req.shopContext!.shopId;
      const allowCost = canViewCost(req);
      const created = [];
      const skipped = [];

      for (const row of preview.rows.filter((r) => r.ok)) {
        const normalizedName = normalizeProductName(row.name);
        const existing = await ProductModel.findOne({
          shopId,
          normalizedName,
          active: true,
        });
        if (existing && !req.body?.allowDuplicates) {
          skipped.push({ name: row.name, reason: "duplicate", existingId: String(existing._id) });
          continue;
        }
        const product = await ProductModel.create({
          shopId,
          name: row.name,
          normalizedName,
          sellingPrice: row.sellingPrice,
          purchasePrice: row.purchasePrice,
          unit: row.unit || "piece",
          barcode: row.barcode || undefined,
          trackStock: row.trackStock,
          active: true,
        });
        if (row.trackStock && row.openingStock > 0) {
          await InventoryTransactionModel.create({
            shopId,
            productId: product._id,
            type: "OPENING_STOCK",
            quantityDelta: row.openingStock,
            sourceType: "CSV_IMPORT",
            sourceId: product._id,
            unitCost: row.purchasePrice,
            createdBy: req.user!._id,
          });
        }
        created.push(serializeProduct(product.toObject(), row.openingStock, allowCost));
      }

      await writeAudit({
        shopId,
        actorUserId: req.user!._id,
        action: "product.import",
        entityType: "Product",
        metadata: { created: created.length, skipped: skipped.length },
      });

      res.status(201).json({ created, skipped, createdCount: created.length });
    } catch (err) {
      next(err);
    }
  },
);

/** AI Phase 13 — suggest only, never silent merge */
productsRouter.get(
  "/ai/duplicates",
  requireAuth,
  requireShopMember("product.create"),
  async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      if (!q.trim()) {
        res.json({ suggestions: [] });
        return;
      }
      const suggestions = await findDuplicateSuggestions(
        req.shopContext!.shopId,
        q,
        8,
      );
      const allowCost = canViewCost(req);
      res.json({
        mode: "suggest_only",
        message: "AI/heuristic suggestions only — silent merge nahi hota",
        suggestions: suggestions.map((p) => serializeProduct(p, 0, allowCost)),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  "/ai/invoice-extract",
  requireAuth,
  requireShopMember("purchase.create"),
  async (req, res, next) => {
    try {
      // Stub: never mutates stock — human review required
      const text = typeof req.body?.text === "string" ? req.body.text : "";
      const lines = text
        .split(/\n/)
        .map((l: string) => l.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((line: string) => {
          const priceMatch = line.match(/(\d+(?:\.\d+)?)\s*$/);
          const qtyMatch = line.match(/x\s*(\d+)/i);
          return {
            raw: line,
            name: line.replace(/x\s*\d+/i, "").replace(/\d+(?:\.\d+)?\s*$/, "").trim() || line,
            quantity: qtyMatch ? Number(qtyMatch[1]) : 1,
            unitCost: priceMatch ? Number(priceMatch[1]) : 0,
          };
        });

      res.json({
        status: "REVIEW_REQUIRED",
        message: "Human confirmation mandatory before stock changes",
        proposedItems: lines,
        applied: false,
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.get(
  "/:productId",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const product = await findShopProduct(
        req.shopContext!.shopId,
        req.params.productId,
      );
      const stock = await getAvailableStock(
        req.shopContext!.shopId,
        product._id,
      );
      res.json({
        product: serializeProduct(product, stock, canViewCost(req)),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.patch(
  "/:productId",
  requireAuth,
  requireShopMember("product.edit"),
  async (req, res, next) => {
    try {
      const body = updateProductSchema.parse(req.body);
      const product = await findShopProduct(
        req.shopContext!.shopId,
        req.params.productId,
      );

      if (body.name !== undefined) {
        product.name = body.name.trim();
        product.normalizedName = normalizeProductName(body.name);
      }
      if (body.categoryId !== undefined) {
        product.categoryId = body.categoryId
          ? new Types.ObjectId(body.categoryId)
          : undefined;
      }
      if (body.sku !== undefined) product.sku = body.sku;
      if (body.barcode !== undefined) product.barcode = body.barcode || undefined;
      if (body.unit !== undefined) product.unit = body.unit;
      if (body.sellingPrice !== undefined) {
        if (body.sellingPrice !== product.sellingPrice) {
          await writeAudit({
            shopId: req.shopContext!.shopId,
            actorUserId: req.user!._id,
            action: "product.price_change",
            entityType: "Product",
            entityId: String(product._id),
            metadata: {
              from: product.sellingPrice,
              to: body.sellingPrice,
            },
          });
        }
        product.sellingPrice = body.sellingPrice;
      }
      if (body.purchasePrice !== undefined) {
        if (!canViewCost(req)) {
          throw badRequest("No permission to edit purchase cost");
        }
        product.purchasePrice = body.purchasePrice;
      }
      if (body.mrp !== undefined) product.mrp = body.mrp;
      if (body.trackStock !== undefined) product.trackStock = body.trackStock;
      if (body.minStock !== undefined) product.minStock = body.minStock;
      if (body.isFavorite !== undefined) product.isFavorite = body.isFavorite;
      if (body.active !== undefined) product.active = body.active;
      if (body.imageUrl !== undefined) {
        product.imageUrl = body.imageUrl || undefined;
      }

      await product.save();
      const stock = await getAvailableStock(
        req.shopContext!.shopId,
        product._id,
      );
      res.json({
        product: serializeProduct(product.toObject(), stock, canViewCost(req)),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  "/enrich-images",
  requireAuth,
  requireShopMember("product.edit"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const missing = await ProductModel.find({
        shopId,
        $or: [
          { imageUrl: { $exists: false } },
          { imageUrl: null },
          { imageUrl: "" },
        ],
      })
        .limit(40)
        .exec();

      let updated = 0;
      for (const product of missing) {
        const url = await suggestProductImage({
          name: product.name,
          barcode: product.barcode,
        });
        if (!url) continue;
        product.imageUrl = url;
        await product.save();
        updated += 1;
      }

      res.json({
        scanned: missing.length,
        updated,
        message:
          updated > 0
            ? `${updated} products pe clean catalog photo lag gayi`
            : "Packshot nahi mili — category art UI pe dikhegi",
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.post(
  "/:productId/favorite",
  requireAuth,
  requireShopMember("product.edit"),
  async (req, res, next) => {
    try {
      const product = await findShopProduct(
        req.shopContext!.shopId,
        req.params.productId,
      );
      const nextVal =
        typeof req.body?.isFavorite === "boolean"
          ? req.body.isFavorite
          : !product.isFavorite;
      product.isFavorite = nextVal;
      await product.save();
      const stock = await getAvailableStock(
        req.shopContext!.shopId,
        product._id,
      );
      res.json({
        product: serializeProduct(product.toObject(), stock, canViewCost(req)),
      });
    } catch (err) {
      next(err);
    }
  },
);

productsRouter.delete(
  "/:productId",
  requireAuth,
  requireShopMember("product.edit"),
  async (req, res, next) => {
    try {
      const product = await findShopProduct(
        req.shopContext!.shopId,
        req.params.productId,
      );
      product.active = false;
      await product.save();
      const stock = await getAvailableStock(
        req.shopContext!.shopId,
        product._id,
      );
      res.json({
        ok: true,
        product: serializeProduct(product.toObject(), stock, canViewCost(req)),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const categoriesRouter = Router({ mergeParams: true });

categoriesRouter.get(
  "/",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const cats = await ProductCategoryModel.find({
        shopId: req.shopContext!.shopId,
        active: true,
      })
        .sort({ name: 1 })
        .lean();
      res.json({
        categories: cats.map((c) => ({
          _id: String(c._id),
          name: c.name,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

categoriesRouter.post(
  "/",
  requireAuth,
  requireShopMember("product.create"),
  async (req, res, next) => {
    try {
      const body = createCategorySchema.parse(req.body);
      const normalizedName = normalizeProductName(body.name);
      const cat = await ProductCategoryModel.create({
        shopId: req.shopContext!.shopId,
        name: body.name.trim(),
        normalizedName,
        active: true,
      });
      res.status(201).json({
        category: { _id: String(cat._id), name: cat.name },
      });
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: number }).code === 11000
      ) {
        next(conflict("Category already exists"));
        return;
      }
      next(err);
    }
  },
);

async function findShopProduct(shopId: Types.ObjectId, productId: string) {
  if (!Types.ObjectId.isValid(productId)) throw notFound("Product not found");
  const product = await ProductModel.findOne({
    _id: productId,
    shopId,
  });
  if (!product) throw notFound("Product not found");
  return product;
}

async function findDuplicateSuggestions(
  shopId: Types.ObjectId,
  name: string,
  limit = 5,
) {
  const normalized = normalizeProductName(name);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter((t) => t.length >= 2);
  const ors: Record<string, unknown>[] = [
    { normalizedName: normalized },
    { normalizedName: new RegExp(`^${escapeRegex(normalized)}`) },
  ];
  for (const token of tokens.slice(0, 3)) {
    ors.push({ normalizedName: new RegExp(escapeRegex(token), "i") });
  }
  return ProductModel.find({
    shopId,
    active: true,
    $or: ors,
  })
    .limit(limit)
    .lean();
}

function serializeProduct(
  p: {
    _id: { toString(): string };
    shopId: { toString(): string };
    name: string;
    normalizedName: string;
    categoryId?: { toString(): string } | null;
    sku?: string | null;
    barcode?: string | null;
    unit: string;
    sellingPrice: number;
    purchasePrice?: number | null;
    mrp?: number | null;
    trackStock: boolean;
    minStock?: number | null;
    isFavorite?: boolean | null;
    active: boolean;
    imageUrl?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  availableStock: number,
  allowCost = false,
) {
  return {
    _id: String(p._id),
    shopId: String(p.shopId),
    name: p.name,
    normalizedName: p.normalizedName,
    categoryId: p.categoryId ? String(p.categoryId) : null,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    unit: p.unit,
    sellingPrice: p.sellingPrice,
    purchasePrice: allowCost ? (p.purchasePrice ?? null) : undefined,
    mrp: p.mrp ?? null,
    trackStock: p.trackStock,
    minStock: p.minStock ?? null,
    isFavorite: Boolean(p.isFavorite),
    active: p.active,
    imageUrl: p.imageUrl ?? null,
    availableStock: p.trackStock ? availableStock : null,
    createdAt: p.createdAt?.toISOString?.(),
    updatedAt: p.updatedAt?.toISOString?.(),
  };
}

type CsvRow = {
  ok: boolean;
  name: string;
  sellingPrice: number;
  purchasePrice?: number;
  openingStock: number;
  unit: string;
  barcode?: string;
  trackStock: boolean;
  error?: string;
};

function previewCsvProducts(csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    return { rows: [] as CsvRow[], errors: ["Empty CSV"], headers: [] as string[] };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const nameIdx = headers.findIndex((h) =>
    ["name", "product", "item"].includes(h),
  );
  const priceIdx = headers.findIndex((h) =>
    ["sellingprice", "price", "mrp", "selling_price"].includes(h),
  );
  const costIdx = headers.findIndex((h) =>
    ["purchaseprice", "cost", "purchase_price"].includes(h),
  );
  const stockIdx = headers.findIndex((h) =>
    ["openingstock", "stock", "opening_stock"].includes(h),
  );
  const unitIdx = headers.findIndex((h) => h === "unit");
  const barcodeIdx = headers.findIndex((h) => h === "barcode");
  const categoryIdx = headers.findIndex((h) => h === "category");

  if (nameIdx < 0 || priceIdx < 0) {
    return {
      rows: [] as CsvRow[],
      errors: ["CSV must include name and sellingPrice columns"],
      headers,
    };
  }

  const rows: CsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const name = (cols[nameIdx] ?? "").trim();
    const sellingPrice = Number(cols[priceIdx]);
    const purchasePrice =
      costIdx >= 0 && cols[costIdx] ? Number(cols[costIdx]) : undefined;
    const openingStock =
      stockIdx >= 0 && cols[stockIdx] ? Number(cols[stockIdx]) : 0;
    const unit = unitIdx >= 0 ? cols[unitIdx]?.trim() || "piece" : "piece";
    const barcode = barcodeIdx >= 0 ? cols[barcodeIdx]?.trim() : undefined;

    if (!name) {
      const row = {
        ok: false,
        name: "",
        sellingPrice: 0,
        openingStock: 0,
        unit,
        trackStock: openingStock > 0,
        error: `Row ${i + 1}: name missing`,
      };
      rows.push(row);
      errors.push(row.error!);
      continue;
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      const row = {
        ok: false,
        name,
        sellingPrice: 0,
        openingStock: 0,
        unit,
        trackStock: false,
        error: `Row ${i + 1}: invalid sellingPrice`,
      };
      rows.push(row);
      errors.push(row.error!);
      continue;
    }

    rows.push({
      ok: true,
      name,
      sellingPrice,
      purchasePrice:
        purchasePrice !== undefined && Number.isFinite(purchasePrice)
          ? purchasePrice
          : undefined,
      openingStock: Number.isFinite(openingStock) ? openingStock : 0,
      unit,
      barcode,
      trackStock: true,
    });
    void categoryIdx;
  }

  return { rows, errors, headers };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
