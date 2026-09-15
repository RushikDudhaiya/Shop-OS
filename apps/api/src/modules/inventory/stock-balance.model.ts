import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * Denormalized on-hand qty per shop product.
 * Source of truth for concurrent reservation; ledger (InventoryTransaction) remains audit history.
 */
const stockBalanceSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

stockBalanceSchema.index({ shopId: 1, productId: 1 }, { unique: true });

export type StockBalanceDoc = InferSchemaType<typeof stockBalanceSchema> & {
  _id: Types.ObjectId;
};

export const StockBalanceModel = model("StockBalance", stockBalanceSchema);
