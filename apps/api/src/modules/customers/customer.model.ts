import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const customerSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    notes: { type: String },
    creditLimit: { type: Number, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

customerSchema.index({ shopId: 1, phone: 1 });
customerSchema.index({ shopId: 1, name: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & {
  _id: Types.ObjectId;
};

export const CustomerModel = model("Customer", customerSchema);
