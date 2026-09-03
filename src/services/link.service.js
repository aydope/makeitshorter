import { Link } from "../models/Link.js";
import { LinkAnalytics } from "../models/LinkAnalytics.js";
import { Blacklist } from "../models/Blacklist.js";
import { generateShortCode } from "../utils/nanoid.js";
import { AppError } from "../utils/AppError.js";
import { getIO } from "../config/socket.js";

const isValidUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const checkBlacklist = async (value, blacklistEntries, errorMessage) => {
  const lowerValue = value.toLowerCase();

  for (const entry of blacklistEntries) {
    const entryDomain = entry.domain.toLowerCase();
    let isBlocked = false;

    try {
      const regex = new RegExp(entry.domain, "i");
      isBlocked = regex.test(lowerValue);
    } catch {
      isBlocked = lowerValue.includes(entryDomain);
    }

    if (isBlocked) {
      throw AppError.badRequest(`${errorMessage} Reason: ${entry.reason}`);
    }
  }
};

const emitSocketEvent = (event, data, rooms = []) => {
  try {
    const io = getIO();
    rooms.filter(Boolean).forEach((room) => {
      if (room) io.to(room).emit(event, data);
    });
  } catch (error) {
    console.error("Socket emit error:", error.message);
  }
};

const getUserAgentInfo = (userAgent) => {
  const ua = userAgent || "";

  const browserPatterns = [
    { name: "Edge", pattern: /Edg\// },
    { name: "Opera", pattern: /OPR\// },
    { name: "Chrome", pattern: /Chrome\// },
    { name: "Firefox", pattern: /Firefox\// },
    { name: "Safari", pattern: /Safari\// },
  ];

  const osPatterns = [
    { name: "Windows", pattern: /Windows/ },
    { name: "macOS", pattern: /Mac OS X/ },
    { name: "iOS", pattern: /iPhone|iPad|iPod/ },
    { name: "Android", pattern: /Android/ },
    { name: "Linux", pattern: /Linux/ },
  ];

  const devicePatterns = [
    { name: "Tablet", pattern: /Tablet|iPad/ },
    { name: "Mobile", pattern: /Mobile/ },
    { name: "Desktop", pattern: /Windows|Macintosh|Linux/ },
  ];

  const browser =
    browserPatterns.find((b) => b.pattern.test(ua))?.name || "Unknown";
  const os = osPatterns.find((o) => o.pattern.test(ua))?.name || "Unknown";
  const device =
    devicePatterns.find((d) => d.pattern.test(ua))?.name || "Unknown";

  return { browser, os, device, userAgent: ua };
};

const getIpInfo = (ip) => {
  if (!ip) {
    return { version: "Unknown", isLocal: false };
  }

  const normalizedIp = ip.replace(/^::ffff:/, "");

  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex =
    /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:|^::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$/;

  const isLocal =
    normalizedIp === "127.0.0.1" ||
    normalizedIp === "localhost" ||
    ip === "::1" ||
    normalizedIp === "0.0.0.0";

  const isPrivate =
    /^10\./.test(normalizedIp) ||
    /^192\.168\./.test(normalizedIp) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalizedIp) ||
    /^169\.254\./.test(normalizedIp);

  return {
    version: ipv4Regex.test(normalizedIp)
      ? "IPv4"
      : ipv6Regex.test(ip)
        ? "IPv6"
        : "Unknown",
    isLocal,
    isPrivate,
  };
};

const getGeoLocation = async (ip) => {
  if (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip === "localhost" ||
    ip === "::ffff:127.0.0.1" ||
    ip === "0.0.0.0"
  ) {
    return {
      country: "Local",
      countryCode: "LOCAL",
      region: null,
      city: null,
      zip: null,
      lat: null,
      lon: null,
      timezone: null,
      isp: null,
      org: null,
      as: null,
    };
  }

  const privateRanges = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^169\.254\./,
    /^fc00:/,
    /^fe80:/,
  ];

  if (privateRanges.some((regex) => regex.test(ip))) {
    return {
      country: "Private Network",
      countryCode: "PRIVATE",
      region: null,
      city: null,
      zip: null,
      lat: null,
      lon: null,
      timezone: null,
      isp: null,
      org: null,
      as: null,
    };
  }

  try {
    const response = await fetch(`https://ipwho.is/${ip}`);

    if (!response.ok) {
      console.warn(`ipwho.is HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.success) {
      console.warn(`ipwho.is fail: ${data.message}`);
      return null;
    }

    return {
      country: data.country || null,
      countryCode: data.country_code || null,
      region: data.region || null,
      city: data.city || null,
      zip: data.postal || null,
      lat: data.latitude || null,
      lon: data.longitude || null,
      timezone: data.timezone?.id || data.timezone || null,
      isp: data.connection?.isp || null,
      org: data.connection?.org || null,
      as: data.connection?.asn ? `AS${data.connection.asn}` : null,
    };
  } catch (error) {
    console.error(`Geo lookup error for IP ${ip}:`, error.message);
    return null;
  }
};

const trackAnalytics = async (link, request) => {
  try {
    const userAgentInfo = getUserAgentInfo(request.headers["user-agent"]);

    const clientIp =
      request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      request.headers["x-real-ip"] ||
      request.ip;

    const ipInfo = getIpInfo(clientIp);
    const geoInfo = await getGeoLocation(clientIp);

    // Check if this IP has visited before (BEFORE creating new record)
    const existingVisit = await LinkAnalytics.findOne({
      linkId: link._id,
      ip: clientIp,
    })
      .sort({ timestamp: 1 })
      .select("_id")
      .lean();

    // Save analytics record
    await LinkAnalytics.create({
      linkId: link._id,
      ip: clientIp,
      ipInfo,
      userAgent: userAgentInfo,
      geo: geoInfo,
      referer: request.headers.referer || request.headers.referrer || null,
      timestamp: new Date(),
    });

    // Update link counters
    const updateData = {
      $inc: {
        totalVisitors: 1,
      },
      $set: {
        lastClickedAt: new Date(),
      },
    };

    // If this is the first visit from this IP, increment uniqueVisitors
    if (!existingVisit) {
      updateData.$inc.uniqueVisitors = 1;
    }

    await Link.updateOne({ _id: link._id }, updateData);
  } catch (error) {
    console.error("Analytics tracking error:", error.message);
  }
};

export class LinkService {
  static async createLink(linkData, userId = null) {
    const { originalUrl, customCode, title } = linkData;

    if (!isValidUrl(originalUrl)) {
      throw AppError.badRequest(
        "Invalid URL format. Please enter a valid URL (e.g., https://example.com)",
      );
    }

    const blacklistEntries = await Blacklist.find({}).lean();
    await checkBlacklist(
      originalUrl,
      blacklistEntries,
      "This URL contains a blacklisted word/pattern.",
    );

    if (customCode && !userId) {
      throw AppError.unauthorized(
        "You must be logged in to create custom links",
      );
    }

    if (customCode) {
      const customCodeLower = customCode.toLowerCase();
      await checkBlacklist(
        customCodeLower,
        blacklistEntries,
        "This custom code contains a blacklisted word.",
      );

      const existingLink = await Link.findOne({ shortCode: customCodeLower })
        .select("_id")
        .lean();
      if (existingLink) {
        throw AppError.conflict("This custom code is already in use");
      }
    }

    const shortCode = await generateShortCode(customCode || null);

    const link = await Link.create({
      userId: userId || null,
      shortCode,
      originalUrl,
      title: title?.trim() || "",
      isCustom: !!customCode,
    });

    emitSocketEvent("link-created", link, [
      `user-${userId}`,
      "admin-dashboard",
    ]);

    return link;
  }

  static async redirectLink(shortCode, request = null) {
    const link = await Link.findOne({
      shortCode: shortCode.toLowerCase(),
      isActive: true,
      isBlacklisted: false,
    });

    if (!link) {
      throw AppError.notFound("Link not found or has been disabled");
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw AppError.gone("This link has expired");
    }

    // Update clicks only (lastClickedAt will be set in trackAnalytics)
    await Link.updateOne(
      { _id: link._id },
      {
        $inc: { clicks: 1 },
      },
    );

    const updatedClicks = link.clicks + 1;

    // Track analytics (this will update totalVisitors, uniqueVisitors, lastClickedAt)
    if (request) {
      await trackAnalytics(link, request);
    }

    emitSocketEvent(
      "link-clicked",
      { linkId: link._id, clicks: updatedClicks },
      [`user-${link.userId}`, "admin-dashboard"],
    );

    return link.originalUrl;
  }

  static async getUserLinks(userId, page = 1, limit = 10, search = "") {
    const skip = (page - 1) * limit;
    const query = { userId };

    if (search?.trim()) {
      const searchRegex = { $regex: search.trim(), $options: "i" };
      query.$or = [
        { shortCode: searchRegex },
        { originalUrl: searchRegex },
        { title: searchRegex },
      ];
    }

    const [links, total] = await Promise.all([
      Link.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v")
        .lean(),
      Link.countDocuments(query),
    ]);

    return {
      links,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async updateLink(linkId, userId, updateData) {
    const link = await Link.findOne({ _id: linkId, userId });

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    if (link.deactivatedByAdmin && updateData.isActive === true) {
      throw AppError.forbidden(
        "This link was deactivated by admin and cannot be reactivated",
      );
    }

    const allowedUpdates = ["title", "originalUrl", "isActive"];
    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        if (key === "originalUrl" && updateData[key]) {
          if (!isValidUrl(updateData[key])) {
            throw AppError.badRequest("Invalid URL format");
          }
        }
        link[key] = key === "title" ? updateData[key]?.trim() : updateData[key];
      }
    }

    await link.save({ validateBeforeSave: false });

    emitSocketEvent("link-updated", link, [`user-${userId}`]);

    return link;
  }

  static async deleteLink(linkId, userId) {
    const link = await Link.findOneAndDelete({ _id: linkId, userId });

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    await LinkAnalytics.deleteMany({ linkId: link._id });

    emitSocketEvent("link-deleted", { linkId }, [`user-${userId}`]);

    return link;
  }

  static async getLinkStats(linkId, userId) {
    const link = await Link.findOne({ _id: linkId, userId })
      .select(
        "_id shortCode originalUrl title clicks totalVisitors uniqueVisitors lastClickedAt isActive isBlacklisted deactivatedByAdmin createdAt",
      )
      .lean();

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    return {
      link,
      totalClicks: link.clicks,
      totalVisitors: link.totalVisitors || 0,
      uniqueVisitors: link.uniqueVisitors || 0,
      lastClickedAt: link.lastClickedAt,
      isActive: link.isActive,
      createdAt: link.createdAt,
    };
  }

  static async getLinkByShortCode(shortCode) {
    const link = await Link.findOne({
      shortCode: shortCode.toLowerCase(),
      isActive: true,
      isBlacklisted: false,
    }).lean();

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    return link;
  }

  static async getAllLinks(page = 1, limit = 50, search = "") {
    const skip = (page - 1) * limit;
    const query = {};

    if (search?.trim()) {
      const searchRegex = { $regex: search.trim(), $options: "i" };
      query.$or = [
        { shortCode: searchRegex },
        { originalUrl: searchRegex },
        { title: searchRegex },
      ];
    }

    const [links, total] = await Promise.all([
      Link.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "username email")
        .select("-__v")
        .lean(),
      Link.countDocuments(query),
    ]);

    return {
      links,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async adminUpdateLink(linkId, updateData) {
    const link = await Link.findById(linkId);

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    const allowedUpdates = ["isActive", "isBlacklisted", "deactivatedByAdmin"];

    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        link[key] = updateData[key];
      }
    }

    if (updateData?.deactivatedByAdmin) {
      link.isActive = false;
    }

    await link.save({ validateBeforeSave: false });

    emitSocketEvent("link-updated", link, [
      `user-${link.userId}`,
      "admin-dashboard",
    ]);

    return link;
  }

  static async adminDeleteLink(linkId) {
    const link = await Link.findByIdAndDelete(linkId);

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    await LinkAnalytics.deleteMany({ linkId: link._id });

    emitSocketEvent("link-deleted", { linkId }, [
      `user-${link.userId}`,
      "admin-dashboard",
    ]);

    return link;
  }

  static async getLinkAnalytics(linkId, userId = null, period = "7d") {
    const link = await Link.findOne({
      _id: linkId,
      ...(userId && { userId }),
    }).lean();

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    const periodMap = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000,
      all: null,
    };

    const timeFilter = periodMap[period] || periodMap["7d"];
    const dateFilter = timeFilter
      ? { timestamp: { $gte: new Date(Date.now() - timeFilter) } }
      : {};

    const baseMatch = { linkId: link._id, ...dateFilter };

    const [
      totalVisits,
      uniqueIps,
      deviceStats,
      browserStats,
      osStats,
      countryStats,
      refererStats,
      dailyStats,
      hourlyStats,
      recentVisits,
    ] = await Promise.all([
      // Total visits
      LinkAnalytics.countDocuments(baseMatch),

      // Unique IPs
      LinkAnalytics.distinct("ip", baseMatch),

      // Device stats
      LinkAnalytics.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $ifNull: ["$userAgent.device", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Browser stats
      LinkAnalytics.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $ifNull: ["$userAgent.browser", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // OS stats
      LinkAnalytics.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $ifNull: ["$userAgent.os", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Country stats
      LinkAnalytics.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $ifNull: ["$geo.country", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Referrer stats
      LinkAnalytics.aggregate([
        {
          $match: {
            ...baseMatch,
            referer: { $ne: null, $ne: "" },
          },
        },
        {
          $group: {
            _id: "$referer",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Daily stats
      LinkAnalytics.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
            count: { $sum: 1 },
            uniqueVisitors: { $addToSet: "$ip" },
          },
        },
        {
          $project: {
            date: "$_id",
            count: 1,
            uniqueVisitors: { $size: "$uniqueVisitors" },
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Hourly stats
      LinkAnalytics.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $hour: "$timestamp" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Recent visits
      LinkAnalytics.find(baseMatch).sort({ timestamp: -1 }).limit(10).lean(),
    ]);

    return {
      link: {
        _id: link._id,
        shortCode: link.shortCode,
        originalUrl: link.originalUrl,
        title: link.title,
        clicks: link.clicks,
        totalVisitors: link.totalVisitors || totalVisits,
        uniqueVisitors: link.uniqueVisitors || uniqueIps.length,
        lastClickedAt: link.lastClickedAt,
        isActive: link.isActive,
        createdAt: link.createdAt,
      },
      summary: {
        totalVisits,
        uniqueVisitors: uniqueIps.length,
        averagePerDay:
          dailyStats.length > 0
            ? Math.round((totalVisits / dailyStats.length) * 10) / 10
            : 0,
      },
      deviceStats,
      browserStats,
      osStats,
      countryStats,
      refererStats,
      dailyStats,
      hourlyStats,
      recentVisits,
      period,
    };
  }
}

export default LinkService;
