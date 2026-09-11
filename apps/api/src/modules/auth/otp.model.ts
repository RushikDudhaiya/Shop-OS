import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const otpChallengeSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date },
  },
  { timestamps: true },
);

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpChallengeDoc = InferSchemaType<typeof otpChallengeSchema> & {
  _id: Types.ObjectId;
};

export const OtpChallengeModel = model("OtpChallenge", otpChallengeSchema);
