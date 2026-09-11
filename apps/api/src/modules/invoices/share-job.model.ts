import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const shareJobSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    saleId: { type: Schema.Types.ObjectId, ref: "Sale", required: true },
    channel: {
      type: String,
      enum: ["WHATSAPP", "PRINT", "SKIP"],
      required: true,
    },
    status: {
      type: String,
      enum: ["QUEUED", "SENT", "FAILED", "SKIPPED"],
      default: "QUEUED",
    },
    phone: { type: String },
    payloadSnapshot: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

shareJobSchema.index({ shopId: 1, saleId: 1, createdAt: -1 });

export type ShareJobDoc = InferSchemaType<typeof shareJobSchema> & {
  _id: Types.ObjectId;
};

export const ShareJobModel = model("ShareJob", shareJobSchema);
