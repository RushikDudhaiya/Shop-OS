import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const shopSettingsSchema = new Schema(
  {
    simpleMode: { type: Boolean, default: true },
    allowNegativeStock: { type: Boolean, default: false },
    defaultPaymentMethod: {
      type: String,
      enum: ["CASH", "UPI", "CARD", "CREDIT", "BANK_TRANSFER"],
      default: "CASH",
    },
    gstEnabled: { type: Boolean, default: false },
    invoicePrefix: { type: String },
    gstin: { type: String },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    billTerms: { type: String },
    askCustomerName: { type: Boolean, default: true },
    taxType: {
      type: String,
      enum: ["GST", "VAT", "NONE"],
      default: "GST",
    },
    gstRate: { type: Number, min: 0, max: 100 },
    taxLabel: { type: String },
    enabledPaymentMethods: [
      {
        type: String,
        enum: ["CASH", "UPI", "CARD", "CREDIT", "BANK_TRANSFER"],
      },
    ],
    logoUrl: { type: String },
  },
  { _id: false },
);

const shopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    businessType: { type: String },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    currency: { type: String, default: "INR" },
    settings: { type: shopSettingsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

shopSchema.index({ ownerUserId: 1 });

export type ShopDoc = InferSchemaType<typeof shopSchema> & {
  _id: Types.ObjectId;
};

export const ShopModel = model("Shop", shopSchema);
