import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const userSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String },
    name: { type: String },
    avatarUrl: { type: String },
    isPhoneVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId;
};

export const UserModel = model("User", userSchema);
