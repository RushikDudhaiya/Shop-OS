import {
  Schema,
  model,
  type ClientSession,
  type InferSchemaType,
  type Types,
} from "mongoose";

/** Per-shop invoice counter */
const shopCounterSchema = new Schema(
  {
    shopId: {
      type: Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      unique: true,
    },
    invoiceSeq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type ShopCounterDoc = InferSchemaType<typeof shopCounterSchema> & {
  _id: Types.ObjectId;
};

export const ShopCounterModel = model("ShopCounter", shopCounterSchema);

export async function nextInvoiceNumber(
  shopId: Types.ObjectId,
  prefix = "INV",
  session?: ClientSession | null,
): Promise<string> {
  const counter = await ShopCounterModel.findOneAndUpdate(
    { shopId },
    { $inc: { invoiceSeq: 1 } },
    { upsert: true, new: true, session: session ?? undefined },
  );
  const seq = String(counter!.invoiceSeq).padStart(4, "0");
  return `${prefix}-${seq}`;
}
