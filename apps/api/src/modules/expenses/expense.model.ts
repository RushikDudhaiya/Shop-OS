import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { EXPENSE_CATEGORIES } from "@shop-os/shared";

const expenseSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ["CASH", "UPI", "BANK"],
      default: "CASH",
    },
    note: { type: String },
    spentAt: { type: Date, required: true, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

expenseSchema.index({ shopId: 1, spentAt: -1 });

export type ExpenseDoc = InferSchemaType<typeof expenseSchema> & {
  _id: Types.ObjectId;
};

export const ExpenseModel = model("Expense", expenseSchema);
