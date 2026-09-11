import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const supplierSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String },
    address: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.index({ shopId: 1, name: 1 });

export type SupplierDoc = InferSchemaType<typeof supplierSchema> & {
  _id: Types.ObjectId;
};

export const SupplierModel = model("Supplier", supplierSchema);

const purchaseSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    status: {
      type: String,
      enum: ["DRAFT", "COMPLETED", "CANCELLED"],
      default: "COMPLETED",
    },
    total: { type: Number, required: true, min: 0 },
    purchasedAt: { type: Date, default: Date.now },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

purchaseSchema.index({ shopId: 1, purchasedAt: -1 });

export type PurchaseDoc = InferSchemaType<typeof purchaseSchema> & {
  _id: Types.ObjectId;
};

export const PurchaseModel = model("Purchase", purchaseSchema);

const purchaseItemSchema = new Schema(
  {
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: "Purchase",
      required: true,
      index: true,
    },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productNameSnapshot: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { timestamps: false },
);

export type PurchaseItemDoc = InferSchemaType<typeof purchaseItemSchema> & {
  _id: Types.ObjectId;
};

export const PurchaseItemModel = model("PurchaseItem", purchaseItemSchema);
