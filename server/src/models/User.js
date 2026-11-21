import mongoose from "mongoose";
import ROLES from "../constants/roles.js";
import { USER_STATUS } from "../constants/statuses.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUserTransform(_doc, ret) {
  delete ret.passwordHash;
  delete ret.__v;
  return ret;
}

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      maxlength: [254, "Email cannot exceed 254 characters"],
      match: [EMAIL_REGEX, "Please provide a valid email address"],
    },
    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: [20, "Phone cannot exceed 20 characters"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },
    role: {
      type: String,
      required: true,
      enum: {
        values: Object.values(ROLES),
        message: "Invalid user role",
      },
      default: ROLES.USER,
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: Object.values(USER_STATUS),
        message: "Invalid user status",
      },
      default: USER_STATUS.ACTIVE,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, "Rejection reason cannot exceed 500 characters"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    mustChangePassword: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0 },
    gateRevision: { type: Number, default: 0, select: false },
    visitRevision: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: { transform: sanitizeUserTransform },
    toObject: { transform: sanitizeUserTransform },
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
