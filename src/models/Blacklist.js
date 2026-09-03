import mongoose from "mongoose";

const blacklistSchema = new mongoose.Schema(
  {
    domain: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    isRegex: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      default: "Blocked by admin",
      trim: true,
      maxlength: 500,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

blacklistSchema.index({ createdAt: -1 });

blacklistSchema.pre("save", function () {
  if (this.isModified("domain")) {
    this.domain = this.domain.toLowerCase().trim();
  }
});

export const Blacklist = mongoose.model("Blacklist", blacklistSchema);
