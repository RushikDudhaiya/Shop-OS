import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/** Short-lived ticket so Socket.IO can auth across Vercel → Render (no shared cookie). */
const realtimeTicketSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

realtimeTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RealtimeTicketDoc = InferSchemaType<typeof realtimeTicketSchema> & {
  _id: Types.ObjectId;
};

export const RealtimeTicketModel = model(
  "RealtimeTicket",
  realtimeTicketSchema,
);
