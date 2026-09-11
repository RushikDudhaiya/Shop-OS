import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@shop-os/shared";

const paymentSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    saleId: { type: Schema.Types.ObjectId, ref: "Sale" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "CONFIRMED",
      required: true,
    },
    reference: { type: String },
    receivedAmount: { type: Number, min: 0 },
    changeGiven: { type: Number, min: 0 },
    receivedAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    idempotencyKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

paymentSchema.index({ shopId: 1, receivedAt: -1 });
paymentSchema.index({ saleId: 1 });
paymentSchema.index(
  { shopId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string", $gt: "" },
    },
  },
);

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & {
  _id: Types.ObjectId;
};

export const PaymentModel = model("Payment", paymentSchema);
