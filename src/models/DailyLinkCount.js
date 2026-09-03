import mongoose from "mongoose";

const dailyLinkCountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

dailyLinkCountSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyLinkCountSchema.index({ date: 1, count: -1 });

export const DailyLinkCount = mongoose.model(
  "DailyLinkCount",
  dailyLinkCountSchema,
);
