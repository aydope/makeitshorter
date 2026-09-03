import mongoose from "mongoose";

const linkAnalyticsSchema = new mongoose.Schema(
  {
    linkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Link",
      required: true,
      index: true,
    },
    ip: {
      type: String,
      required: true,
    },
    ipInfo: {
      version: {
        type: String,
        enum: ["IPv4", "IPv6", "Unknown"],
        default: "Unknown",
      },
      isLocal: {
        type: Boolean,
        default: false,
      },
    },
    userAgent: {
      browser: {
        type: String,
        default: "Unknown",
      },
      os: {
        type: String,
        default: "Unknown",
      },
      device: {
        type: String,
        enum: ["Desktop", "Mobile", "Tablet", "Unknown"],
        default: "Unknown",
      },
      userAgent: {
        type: String,
        default: "",
      },
    },
    geo: {
      country: {
        type: String,
        default: null,
      },
      countryCode: {
        type: String,
        default: null,
      },
      region: {
        type: String,
        default: null,
      },
      city: {
        type: String,
        default: null,
      },
      zip: {
        type: String,
        default: null,
      },
      lat: {
        type: Number,
        default: null,
      },
      lon: {
        type: Number,
        default: null,
      },
      timezone: {
        type: String,
        default: null,
      },
      isp: {
        type: String,
        default: null,
      },
      org: {
        type: String,
        default: null,
      },
      as: {
        type: String,
        default: null,
      },
    },
    referer: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

linkAnalyticsSchema.index({ linkId: 1, timestamp: -1 });
linkAnalyticsSchema.index({ linkId: 1, ip: 1 });
linkAnalyticsSchema.index({ linkId: 1, "geo.country": 1 });
linkAnalyticsSchema.index({ linkId: 1, "userAgent.browser": 1 });
linkAnalyticsSchema.index({ linkId: 1, "userAgent.device": 1 });
linkAnalyticsSchema.index({ linkId: 1, "userAgent.os": 1 });

export const LinkAnalytics = mongoose.model(
  "LinkAnalytics",
  linkAnalyticsSchema,
);
