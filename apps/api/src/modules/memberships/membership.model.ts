import { Schema, model, type InferSchemaType, type Types } from "mongoose";
import { PERMISSIONS, ROLES } from "@shop-os/shared";

const membershipSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
    permissions: {
      type: [String],
      enum: PERMISSIONS,
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INVITED", "DISABLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

membershipSchema.index({ shopId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1 });

export type MembershipDoc = InferSchemaType<typeof membershipSchema> & {
  _id: Types.ObjectId;
};

export const MembershipModel = model("Membership", membershipSchema);
