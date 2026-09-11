import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const productCategorySchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productCategorySchema.index(
  { shopId: 1, normalizedName: 1 },
  { unique: true },
);

export type ProductCategoryDoc = InferSchemaType<typeof productCategorySchema> & {
  _id: Types.ObjectId;
};

export const ProductCategoryModel = model(
  "ProductCategory",
  productCategorySchema,
);
