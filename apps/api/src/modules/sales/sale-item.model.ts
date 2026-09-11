import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const saleItemSchema = new Schema(
  {
    saleId: { type: Schema.Types.ObjectId, ref: "Sale", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productNameSnapshot: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCostSnapshot: { type: Number, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: false },
);

export type SaleItemDoc = InferSchemaType<typeof saleItemSchema> & {
  _id: Types.ObjectId;
};

export const SaleItemModel = model("SaleItem", saleItemSchema);
