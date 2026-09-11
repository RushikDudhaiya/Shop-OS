import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { SALE_STATUSES } from "@shop-os/shared";

const saleSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    invoiceNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    status: {
      type: String,
      enum: SALE_STATUSES,
      default: "DRAFT",
      required: true,
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountDue: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    completedAt: { type: Date },
    idempotencyKey: { type: String },
  },
  { timestamps: true },
);

saleSchema.index({ shopId: 1, invoiceNumber: 1 }, { unique: true });
saleSchema.index({ shopId: 1, completedAt: -1 });
saleSchema.index(
  { shopId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string", $gt: "" },
    },
  },
);

export type SaleDoc = InferSchemaType<typeof saleSchema> & {
  _id: Types.ObjectId;
};

export const SaleModel = model("Sale", saleSchema);
