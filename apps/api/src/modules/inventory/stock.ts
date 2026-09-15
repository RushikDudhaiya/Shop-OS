import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import { badRequest } from "../../lib/errors.js";
import { InventoryTransactionModel } from "./inventory-transaction.model.js";
import { StockBalanceModel } from "./stock-balance.model.js";

async function sumLedger(
  shopId: Types.ObjectId,
  productId: Types.ObjectId,
  session?: ClientSession | null,
): Promise<number> {
  const pipeline = [
    { $match: { shopId, productId } },
    { $group: { _id: null, total: { $sum: "$quantityDelta" } } },
  ];
  const agg = InventoryTransactionModel.aggregate<{ total: number }>(pipeline);
  if (session) agg.session(session);
  const [row] = await agg;
  return row?.total ?? 0;
}

/** Ensure StockBalance exists (seed from ledger on first use). */
export async function ensureStockBalance(
  shopId: Types.ObjectId,
  productId: Types.ObjectId,
  session?: ClientSession | null,
): Promise<number> {
  const existing = await StockBalanceModel.findOne({ shopId, productId }).session(
    session ?? null,
  );
  if (existing) return existing.quantity;

  const fromLedger = await sumLedger(shopId, productId, session);
  try {
    await StockBalanceModel.create(
      [{ shopId, productId, quantity: fromLedger }],
      { session: session ?? undefined },
    );
  } catch (err) {
    // race: another writer inserted — re-read
    const again = await StockBalanceModel.findOne({ shopId, productId }).session(
      session ?? null,
    );
    if (again) return again.quantity;
    throw err;
  }
  return fromLedger;
}

export async function getAvailableStock(
  shopId: Types.ObjectId,
  productId: Types.ObjectId,
  session?: ClientSession | null,
): Promise<number> {
  return ensureStockBalance(shopId, productId, session);
}

export async function getAvailableStockMap(
  shopId: Types.ObjectId,
  productIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();

  const balances = await StockBalanceModel.find({
    shopId,
    productId: { $in: productIds },
  }).lean();
  const map = new Map(balances.map((b) => [String(b.productId), b.quantity]));

  const missing = productIds.filter((id) => !map.has(String(id)));
  for (const productId of missing) {
    const qty = await ensureStockBalance(shopId, productId);
    map.set(String(productId), qty);
  }
  return map;
}

/**
 * Atomically apply a stock delta. Negative deltas reject when stock would go below 0
 * unless allowNegative is true. Prevents concurrent overselling.
 */
export async function applyStockDelta(input: {
  shopId: Types.ObjectId;
  productId: Types.ObjectId;
  delta: number;
  allowNegative?: boolean;
  session?: ClientSession | null;
  productName?: string;
}): Promise<number> {
  const { shopId, productId, delta, allowNegative = false, session } = input;
  if (!Number.isFinite(delta) || delta === 0) {
    return ensureStockBalance(shopId, productId, session);
  }

  await ensureStockBalance(shopId, productId, session);

  if (delta < 0 && !allowNegative) {
    const need = Math.abs(delta);
    const updated = await StockBalanceModel.findOneAndUpdate(
      { shopId, productId, quantity: { $gte: need } },
      { $inc: { quantity: delta } },
      { new: true, session: session ?? undefined },
    );
    if (!updated) {
      const available = await getAvailableStock(shopId, productId, session);
      const label = input.productName ? `: ${input.productName}` : "";
      throw badRequest(
        `Stock kam hai${label} (available ${available}, only ${available} units are available)`,
      );
    }
    return updated.quantity;
  }

  const updated = await StockBalanceModel.findOneAndUpdate(
    { shopId, productId },
    { $inc: { quantity: delta } },
    { new: true, upsert: true, session: session ?? undefined },
  );
  return updated?.quantity ?? 0;
}
