import { createPaymentSchema, createSaleSchema } from "@shop-os/shared";
import mongoose, { type ClientSession, type Types } from "mongoose";
import { badRequest, notFound } from "../../lib/errors.js";
import { InventoryTransactionModel } from "../inventory/inventory-transaction.model.js";
import { applyStockDelta, getAvailableStock } from "../inventory/stock.js";
import { emitStockUpdated } from "../realtime/socket.js";
import { CustomerModel } from "../customers/customer.model.js";
import { PaymentModel } from "../payments/payment.model.js";
import { ProductModel } from "../products/product.model.js";
import { ShopModel } from "../shops/shop.model.js";
import { nextInvoiceNumber } from "../shops/shop-counter.js";
import { SaleItemModel } from "./sale-item.model.js";
import { SaleModel } from "./sale.model.js";

type AuthUserId = Types.ObjectId;

async function withOptionalTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Standalone MongoDB (no replica set) — fall back without transaction.
    if (
      /Transaction numbers are only allowed|replica set|not supported/i.test(
        msg,
      )
    ) {
      return work(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function createSaleForShop(input: {
  shopId: Types.ObjectId;
  userId: AuthUserId;
  body: unknown;
}) {
  const body = createSaleSchema.parse(input.body);

  if (body.idempotencyKey) {
    const existing = await SaleModel.findOne({
      shopId: input.shopId,
      idempotencyKey: body.idempotencyKey,
    });
    if (existing) {
      return loadSaleBundle(existing._id, input.shopId);
    }
  }

  if (body.payment?.method === "CREDIT" && !body.customerId && !body.customer) {
    throw badRequest("Udhaar ke liye customer name chahiye", {
      customer: ["Customer required for credit"],
    });
  }

  const productIds = body.items.map((i) => i.productId);
  const products = await ProductModel.find({
    _id: { $in: productIds },
    shopId: input.shopId,
    active: true,
  });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const shop = await ShopModel.findById(input.shopId);
  if (!shop) throw notFound("Shop not found");
  const allowNegative = Boolean(shop.settings?.allowNegativeStock);
  const settings = shop.settings as {
    gstEnabled?: boolean;
    gstRate?: number | null;
    taxType?: string | null;
  } | null | undefined;

  const lines: Array<{
    productId: Types.ObjectId;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
    unitCostSnapshot?: number;
    discount: number;
    tax: number;
    lineTotal: number;
    trackStock: boolean;
  }> = [];

  for (const item of body.items) {
    const product = byId.get(item.productId);
    if (!product) {
      throw badRequest(`Product not found: ${item.productId}`);
    }
    const unitPrice = item.unitPrice ?? product.sellingPrice;
    const discount = item.discount ?? 0;
    const tax = item.tax ?? 0;
    const lineTotal = roundMoney(unitPrice * item.quantity - discount + tax);
    if (lineTotal < 0) throw badRequest("Invalid line total");

    lines.push({
      productId: product._id,
      productNameSnapshot: product.name,
      quantity: item.quantity,
      unitPrice,
      unitCostSnapshot: product.purchasePrice ?? undefined,
      discount,
      tax,
      lineTotal,
      trackStock: product.trackStock,
    });
  }

  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
  const discount = body.discount ?? 0;
  const roundOffOrExtraTax = body.tax ?? 0;
  const gstAmount = computeSaleGst(settings, subtotal);
  const tax = roundMoney(gstAmount + roundOffOrExtraTax);
  const total = roundMoney(Math.max(0, subtotal - discount + tax));

  let customerId = body.customerId
    ? (await ensureCustomerInShop(input.shopId, body.customerId))._id
    : undefined;

  if (!customerId && body.customer) {
    customerId = (await upsertCustomer(input.shopId, body.customer))._id;
  }

  const prefix = shop.settings?.invoicePrefix || "INV";

  const { saleId, stockUpdates, paymentResult } = await withOptionalTransaction(
    async (session) => {
      // Soft pre-check (atomic reserve happens below)
      if (body.complete) {
        for (const line of lines) {
          if (!line.trackStock) continue;
          const available = await getAvailableStock(
            input.shopId,
            line.productId,
            session,
          );
          if (!allowNegative && available < line.quantity) {
            throw badRequest(
              `Stock kam hai: ${line.productNameSnapshot} (available ${available})`,
            );
          }
        }
      }

      const invoiceNumber = await nextInvoiceNumber(
        input.shopId,
        prefix,
        session,
      );

      const [sale] = await SaleModel.create(
        [
          {
            shopId: input.shopId,
            invoiceNumber,
            customerId,
            status: body.complete ? "COMPLETED" : "DRAFT",
            subtotal,
            discount,
            tax,
            total,
            amountPaid: 0,
            amountDue: total,
            createdBy: input.userId,
            completedAt: body.complete ? new Date() : undefined,
            idempotencyKey: body.idempotencyKey,
          },
        ],
        { session: session ?? undefined },
      );

      await SaleItemModel.insertMany(
        lines.map((l) => ({
          saleId: sale!._id,
          productId: l.productId,
          productNameSnapshot: l.productNameSnapshot,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitCostSnapshot: l.unitCostSnapshot,
          discount: l.discount,
          tax: l.tax,
          lineTotal: l.lineTotal,
        })),
        { session: session ?? undefined },
      );

      let updates: Array<{ productId: Types.ObjectId; currentStock: number }> =
        [];
      if (body.complete) {
        updates = await writeSaleOutStock({
          shopId: input.shopId,
          saleId: sale!._id,
          userId: input.userId,
          lines,
          allowNegative,
          session,
        });
      }

      let payResult: Awaited<ReturnType<typeof applyPaymentToSale>> | null =
        null;

      if (body.complete && body.payment) {
        const method = body.payment.method;
        if (method === "CREDIT") {
          sale!.amountPaid = 0;
          sale!.amountDue = total;
          await sale!.save({ session: session ?? undefined });
        } else {
          const applied =
            body.payment.amount !== undefined
              ? body.payment.amount
              : total;
          payResult = await applyPaymentToSale({
            shopId: input.shopId,
            saleId: sale!._id,
            userId: input.userId,
            session,
            raw: {
              method,
              amount: applied > 0 ? applied : total,
              receivedAmount: body.payment.receivedAmount,
              reference: body.payment.reference,
              idempotencyKey: body.idempotencyKey
                ? `${body.idempotencyKey}:pay`
                : undefined,
            },
          });
        }
      }

      return {
        saleId: sale!._id,
        stockUpdates: updates,
        paymentResult: payResult,
      };
    },
  );

  if (stockUpdates.length) {
    emitStockUpdated(input.shopId, stockUpdates);
  }

  const bundle = await loadSaleBundle(saleId, input.shopId);
  return {
    ...bundle,
    change: paymentResult?.changeGiven ?? 0,
    receivedAmount: paymentResult?.receivedAmount ?? null,
    stockUpdates: stockUpdates.map((u) => ({
      productId: String(u.productId),
      currentStock: u.currentStock,
    })),
  };
}

export async function applyPaymentToSale(input: {
  shopId: Types.ObjectId;
  saleId: Types.ObjectId;
  userId: AuthUserId;
  raw: unknown;
  session?: ClientSession | null;
}) {
  const body = createPaymentSchema.parse(input.raw);
  const session = input.session ?? null;

  if (body.idempotencyKey) {
    const existing = await PaymentModel.findOne({
      shopId: input.shopId,
      idempotencyKey: body.idempotencyKey,
    }).session(session);
    if (existing) {
      return {
        payment: serializePayment(existing),
        changeGiven: existing.changeGiven ?? 0,
        receivedAmount: existing.receivedAmount ?? null,
        sale: await SaleModel.findById(input.saleId).session(session),
      };
    }
  }

  const sale = await SaleModel.findOne({
    _id: input.saleId,
    shopId: input.shopId,
  }).session(session);
  if (!sale) throw notFound("Sale not found");
  if (sale.status !== "COMPLETED") {
    throw badRequest("Only completed sales accept payments");
  }

  if (body.method === "CREDIT") {
    throw badRequest(
      "CREDIT method only at sale time; use Cash/UPI to collect udhaar",
    );
  }

  const due = roundMoney(sale.amountDue);
  if (due <= 0) throw badRequest("Sale already fully paid");

  const applied = roundMoney(Math.min(body.amount, due));
  if (applied <= 0) throw badRequest("Payment amount must be positive");

  let changeGiven = 0;
  let receivedAmount = body.receivedAmount;

  if (body.method === "CASH") {
    const tendered = body.receivedAmount ?? body.amount;
    if (tendered < applied) {
      throw badRequest("Received cash is less than payment amount");
    }
    receivedAmount = tendered;
    changeGiven = roundMoney(tendered - applied);
  }

  const [payment] = await PaymentModel.create(
    [
      {
        shopId: input.shopId,
        saleId: sale._id,
        customerId: sale.customerId,
        method: body.method,
        amount: applied,
        status: "CONFIRMED",
        reference: body.reference,
        receivedAmount,
        changeGiven,
        receivedAt: new Date(),
        createdBy: input.userId,
        idempotencyKey: body.idempotencyKey,
      },
    ],
    { session: session ?? undefined },
  );

  sale.amountPaid = roundMoney(sale.amountPaid + applied);
  sale.amountDue = roundMoney(Math.max(0, sale.total - sale.amountPaid));
  await sale.save({ session: session ?? undefined });

  return {
    payment: serializePayment(payment!),
    changeGiven,
    receivedAmount: receivedAmount ?? null,
    sale,
  };
}

export async function loadSaleBundle(
  saleId: Types.ObjectId,
  shopId: Types.ObjectId,
) {
  const sale = await SaleModel.findOne({ _id: saleId, shopId });
  if (!sale) throw notFound("Sale not found");
  const items = await SaleItemModel.find({ saleId }).lean();
  const payments = await PaymentModel.find({
    saleId,
    status: "CONFIRMED",
  })
    .sort({ receivedAt: 1 })
    .lean();

  return {
    sale: serializeSale(sale),
    items: items.map(serializeSaleItem),
    payments: payments.map(serializePayment),
  };
}

async function writeSaleOutStock(input: {
  shopId: Types.ObjectId;
  saleId: Types.ObjectId;
  userId: AuthUserId;
  allowNegative: boolean;
  session?: ClientSession | null;
  lines: Array<{
    productId: Types.ObjectId;
    quantity: number;
    trackStock: boolean;
    unitCostSnapshot?: number;
    productNameSnapshot?: string;
  }>;
}): Promise<Array<{ productId: Types.ObjectId; currentStock: number }>> {
  const updates: Array<{ productId: Types.ObjectId; currentStock: number }> =
    [];
  const docs = [];

  for (const l of input.lines) {
    if (!l.trackStock) continue;
    const delta = -Math.abs(l.quantity);
    const currentStock = await applyStockDelta({
      shopId: input.shopId,
      productId: l.productId,
      delta,
      allowNegative: input.allowNegative,
      session: input.session,
      productName: l.productNameSnapshot,
    });
    updates.push({ productId: l.productId, currentStock });
    docs.push({
      shopId: input.shopId,
      productId: l.productId,
      type: "SALE_OUT" as const,
      quantityDelta: delta,
      sourceType: "SALE",
      sourceId: input.saleId,
      unitCost: l.unitCostSnapshot,
      createdBy: input.userId,
    });
  }

  if (docs.length) {
    await InventoryTransactionModel.insertMany(docs, {
      session: input.session ?? undefined,
    });
  }
  return updates;
}

async function ensureCustomerInShop(
  shopId: Types.ObjectId,
  customerId: string,
) {
  const c = await CustomerModel.findOne({ _id: customerId, shopId });
  if (!c) throw notFound("Customer not found");
  return c;
}

async function upsertCustomer(
  shopId: Types.ObjectId,
  data: { name: string; phone?: string },
) {
  if (data.phone) {
    const existing = await CustomerModel.findOne({ shopId, phone: data.phone });
    if (existing) {
      if (existing.name !== data.name) {
        existing.name = data.name;
        await existing.save();
      }
      return existing;
    }
  }
  return CustomerModel.create({
    shopId,
    name: data.name,
    phone: data.phone,
    active: true,
  });
}

export function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** GST/VAT from shop settings on taxable (pre-tax) amount */
export function computeSaleGst(
  settings:
    | {
        gstEnabled?: boolean;
        gstRate?: number | null;
        taxType?: string | null;
      }
    | null
    | undefined,
  taxableAmount: number,
) {
  if (!settings?.gstEnabled) return 0;
  if (settings.taxType === "NONE") return 0;
  const rate = Number(settings.gstRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return roundMoney((Math.max(0, taxableAmount) * rate) / 100);
}

export function serializeSale(sale: {
  _id: { toString(): string };
  shopId: { toString(): string };
  invoiceNumber: string;
  customerId?: { toString(): string } | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  createdBy: { toString(): string };
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: String(sale._id),
    shopId: String(sale.shopId),
    invoiceNumber: sale.invoiceNumber,
    customerId: sale.customerId ? String(sale.customerId) : null,
    status: sale.status,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    amountPaid: sale.amountPaid,
    amountDue: sale.amountDue,
    createdBy: String(sale.createdBy),
    completedAt: sale.completedAt?.toISOString?.() ?? null,
    createdAt: sale.createdAt?.toISOString?.(),
    updatedAt: sale.updatedAt?.toISOString?.(),
  };
}

export function serializeSaleItem(item: {
  _id: { toString(): string };
  saleId: { toString(): string };
  productId: { toString(): string };
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  unitCostSnapshot?: number | null;
  discount: number;
  tax: number;
  lineTotal: number;
}) {
  return {
    _id: String(item._id),
    saleId: String(item.saleId),
    productId: String(item.productId),
    productNameSnapshot: item.productNameSnapshot,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitCostSnapshot: item.unitCostSnapshot ?? null,
    discount: item.discount,
    tax: item.tax,
    lineTotal: item.lineTotal,
  };
}

export function serializePayment(p: {
  _id: { toString(): string };
  shopId: { toString(): string };
  saleId?: { toString(): string } | null;
  customerId?: { toString(): string } | null;
  method: string;
  amount: number;
  status: string;
  reference?: string | null;
  receivedAmount?: number | null;
  changeGiven?: number | null;
  receivedAt?: Date;
  createdBy: { toString(): string };
  createdAt?: Date;
}) {
  return {
    _id: String(p._id),
    shopId: String(p.shopId),
    saleId: p.saleId ? String(p.saleId) : null,
    customerId: p.customerId ? String(p.customerId) : null,
    method: p.method,
    amount: p.amount,
    status: p.status,
    reference: p.reference ?? null,
    receivedAmount: p.receivedAmount ?? null,
    changeGiven: p.changeGiven ?? 0,
    receivedAt: p.receivedAt?.toISOString?.(),
    createdBy: String(p.createdBy),
    createdAt: p.createdAt?.toISOString?.(),
  };
}
