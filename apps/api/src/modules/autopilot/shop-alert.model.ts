import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const shopAlertSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    alertKey: { type: String, required: true },
    type: { type: String, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    reason: { type: String },
    entityType: {
      type: String,
      enum: ["product", "customer", "bill", "purchase", "category", "shop"],
    },
    entityId: { type: Schema.Types.ObjectId },
    actionType: { type: String },
    actionLabel: { type: String },
    actionPath: { type: String },
    estimatedImpact: { type: Number, min: 0 },
    confidence: { type: Number, min: 0, max: 1 },
    status: {
      type: String,
      enum: ["active", "dismissed", "snoozed", "resolved"],
      default: "active",
      required: true,
    },
    expiresAt: { type: Date },
    resolvedAt: { type: Date },
    dismissedAt: { type: Date },
    snoozedUntil: { type: Date },
    fingerprint: { type: String },
  },
  { timestamps: true },
);

shopAlertSchema.index({ shopId: 1, alertKey: 1 }, { unique: true });
shopAlertSchema.index({ shopId: 1, status: 1, updatedAt: -1 });

export type ShopAlertDoc = InferSchemaType<typeof shopAlertSchema> & {
  _id: Types.ObjectId;
};

export const ShopAlertModel = model("ShopAlert", shopAlertSchema);
