import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { INVENTORY_TX_TYPES } from "@shop-os/shared";

/** Minimal ledger — full inventory UI in Phase 5 */
const inventoryTransactionSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    type: { type: String, enum: INVENTORY_TX_TYPES, required: true },
    quantityDelta: { type: Number, required: true },
    sourceType: { type: String, required: true },
    sourceId: { type: Schema.Types.ObjectId },
    unitCost: { type: Number },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inventoryTransactionSchema.index({ shopId: 1, productId: 1, createdAt: 1 });

export type InventoryTransactionDoc = InferSchemaType<
  typeof inventoryTransactionSchema
> & { _id: Types.ObjectId };

export const InventoryTransactionModel = model(
  "InventoryTransaction",
  inventoryTransactionSchema,
);
