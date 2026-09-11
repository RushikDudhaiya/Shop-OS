import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const productSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    unit: { type: String, default: "piece" },
    sellingPrice: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, min: 0 },
    mrp: { type: Number, min: 0 },
    trackStock: { type: Boolean, default: true },
    minStock: { type: Number, min: 0 },
    isFavorite: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    imageUrl: { type: String, trim: true },
  },
  { timestamps: true },
);

productSchema.index({ shopId: 1, normalizedName: 1 });
productSchema.index(
  { shopId: 1, barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { barcode: { $type: "string", $gt: "" } },
  },
);
productSchema.index({ shopId: 1, isFavorite: 1, active: 1 });
productSchema.index({ shopId: 1, name: "text", normalizedName: "text" });

export type ProductDoc = InferSchemaType<typeof productSchema> & {
  _id: Types.ObjectId;
};

export const ProductModel = model("Product", productSchema);
