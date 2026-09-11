import { Types } from "mongoose";
import { InventoryTransactionModel } from "./inventory-transaction.model.js";

export async function getAvailableStock(
  shopId: Types.ObjectId,
  productId: Types.ObjectId,
): Promise<number> {
  const [row] = await InventoryTransactionModel.aggregate<{ total: number }>([
    { $match: { shopId, productId } },
    { $group: { _id: null, total: { $sum: "$quantityDelta" } } },
  ]);
  return row?.total ?? 0;
}

export async function getAvailableStockMap(
  shopId: Types.ObjectId,
  productIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await InventoryTransactionModel.aggregate<{
    _id: Types.ObjectId;
    total: number;
  }>([
    { $match: { shopId, productId: { $in: productIds } } },
    { $group: { _id: "$productId", total: { $sum: "$quantityDelta" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.total]));
}
