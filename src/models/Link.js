import mongoose from "mongoose";

const linkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    originalUrl: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "",
      maxlength: 100,
      trim: true,
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    isBlacklisted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deactivatedByAdmin: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastClickedAt: {
      type: Date,
      default: null,
    },
    totalVisitors: {
      type: Number,
      default: 0,
      min: 0,
    },
    uniqueVisitors: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

linkSchema.index({ userId: 1, createdAt: -1 });
linkSchema.index({ shortCode: 1, isActive: 1 });
linkSchema.index({ isActive: 1, isBlacklisted: 1 });

linkSchema.pre("save", function () {
  if (this.isModified("clicks")) {
    this.lastClickedAt = new Date();
  }
});

export const Link = mongoose.model("Link", linkSchema);
