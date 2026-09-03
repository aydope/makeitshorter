import { User } from "../models/User.js";
import { Link } from "../models/Link.js";
import { LinkAnalytics } from "../models/LinkAnalytics.js";
import { Blacklist } from "../models/Blacklist.js";
import { AppError } from "../utils/AppError.js";
import { getIO } from "../config/socket.js";

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

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export class AdminService {
  static async getAllUsers(page = 1, limit = 20, filters = {}) {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.isActive !== undefined && filters.isActive !== "") {
      query.isActive = filters.isActive === "true";
    }

    if (filters.role && filters.role !== "") {
      query.role = filters.role;
    }

    if (filters.search?.trim()) {
      const searchRegex = { $regex: filters.search.trim(), $options: "i" };
      query.$or = [{ username: searchRegex }, { email: searchRegex }];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -__v -refreshToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getUserDetails(userId) {
    const user = await User.findById(userId)
      .select("-password -__v -refreshToken")
      .lean();

    if (!user) {
      throw AppError.notFound("User not found");
    }

    const [linksCount, totalClicks] = await Promise.all([
      Link.countDocuments({ userId: user._id }),
      Link.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: null, totalClicks: { $sum: "$clicks" } } },
      ]),
    ]);

    return {
      user,
      stats: {
        linksCount,
        totalClicks: totalClicks[0]?.totalClicks || 0,
      },
    };
  }

  static async toggleUserStatus(userId, adminId) {
    if (userId.toString() === adminId.toString()) {
      throw AppError.badRequest("You cannot deactivate your own account");
    }

    const user = await User.findById(userId);

    if (!user) {
      throw AppError.notFound("User not found");
    }

    if (user.role === "admin") {
      throw AppError.forbidden("Cannot modify admin accounts");
    }

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    emitSocketEvent(
      "user-status-changed",
      {
        userId: user._id,
        isActive: user.isActive,
      },
      ["admin-dashboard", `user-${user._id}`],
    );

    return {
      userId: user._id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
    };
  }

  static async getAllLinks(page = 1, limit = 20, filters = {}) {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.isActive !== undefined && filters.isActive !== "") {
      query.isActive = filters.isActive === "true";
    }

    if (filters.isBlacklisted !== undefined && filters.isBlacklisted !== "") {
      query.isBlacklisted = filters.isBlacklisted === "true";
    }

    if (filters.userId && filters.userId !== "") {
      query.userId = filters.userId;
    }

    if (filters.search?.trim()) {
      const searchRegex = { $regex: filters.search.trim(), $options: "i" };
      query.$or = [
        { shortCode: searchRegex },
        { originalUrl: searchRegex },
        { title: searchRegex },
      ];
    }

    const [links, total] = await Promise.all([
      Link.find(query)
        .populate("userId", "username email")
        .select("-__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
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

  static async toggleLinkStatus(linkId) {
    const link = await Link.findById(linkId);

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    link.isActive = !link.isActive;
    link.deactivatedByAdmin = !link.isActive;

    await link.save({ validateBeforeSave: false });

    emitSocketEvent(
      "link-status-changed",
      {
        linkId: link._id,
        isActive: link.isActive,
        deactivatedByAdmin: link.deactivatedByAdmin,
      },
      [`user-${link.userId}`, "admin-dashboard"],
    );

    return link;
  }

  static async blacklistLink(linkId) {
    const link = await Link.findById(linkId);

    if (!link) {
      throw AppError.notFound("Link not found");
    }

    link.isBlacklisted = !link.isBlacklisted;
    if (link.isBlacklisted) {
      link.isActive = false;
      link.deactivatedByAdmin = true;
    }

    await link.save({ validateBeforeSave: false });

    emitSocketEvent(
      "link-blacklist-changed",
      {
        linkId: link._id,
        isBlacklisted: link.isBlacklisted,
        isActive: link.isActive,
      },
      [`user-${link.userId}`, "admin-dashboard"],
    );

    return link;
  }

  static async addToBlacklist(domain, reason, adminId, isRegex = false) {
    const cleanDomain = domain.toLowerCase().trim();

    if (isRegex) {
      try {
        new RegExp(cleanDomain);
      } catch {
        throw AppError.badRequest("Invalid regex pattern");
      }
    }

    const existingBlacklist = await Blacklist.findOne({ domain: cleanDomain });

    if (existingBlacklist) {
      throw AppError.conflict("This word/pattern is already blacklisted");
    }

    const blacklist = await Blacklist.create({
      domain: cleanDomain,
      reason: reason || "Blocked by admin",
      addedBy: adminId,
      isRegex,
    });

    const linksToBlock = await Link.find({
      $or: [
        { originalUrl: { $regex: cleanDomain, $options: "i" } },
        { shortCode: { $regex: cleanDomain, $options: "i" } },
      ],
      isBlacklisted: false,
    });

    const updatePromises = linksToBlock.map((link) => {
      link.isBlacklisted = true;
      link.isActive = false;
      link.deactivatedByAdmin = true;
      return link.save({ validateBeforeSave: false });
    });

    await Promise.all(updatePromises);

    emitSocketEvent(
      "domain-blacklisted",
      {
        blacklist,
        affectedLinks: linksToBlock.length,
      },
      ["admin-dashboard"],
    );

    return {
      blacklist,
      affectedLinks: linksToBlock.length,
    };
  }

  static async removeFromBlacklist(domainId) {
    const blacklist = await Blacklist.findByIdAndDelete(domainId);

    if (!blacklist) {
      throw AppError.notFound("Domain not found in blacklist");
    }

    emitSocketEvent("domain-unblacklisted", { domainId }, ["admin-dashboard"]);

    return blacklist;
  }

  static async getBlacklist(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [blacklist, total] = await Promise.all([
      Blacklist.find()
        .populate("addedBy", "username email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Blacklist.countDocuments(),
    ]);

    return {
      blacklist,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      totalLinks,
      totalClicksResult,
      activeLinks,
      blacklistedLinks,
      totalAnalytics,
      recentUsers,
      recentLinks,
      topLinks,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Link.countDocuments(),
      Link.aggregate([
        { $group: { _id: null, totalClicks: { $sum: "$clicks" } } },
      ]),
      Link.countDocuments({ isActive: true, isBlacklisted: false }),
      Link.countDocuments({ isBlacklisted: true }),
      LinkAnalytics.countDocuments(),
      User.find()
        .select("username email createdAt isActive")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Link.find()
        .select("shortCode originalUrl clicks createdAt isActive")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Link.find()
        .select("shortCode originalUrl clicks")
        .sort({ clicks: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
      links: {
        total: totalLinks,
        active: activeLinks,
        blacklisted: blacklistedLinks,
        totalClicks: totalClicksResult[0]?.totalClicks || 0,
      },
      analytics: {
        totalVisits: totalAnalytics,
      },
      recentUsers,
      recentLinks,
      topLinks,
    };
  }

  static async getSystemStats() {
    const [
      totalLinks,
      totalClicks,
      totalUsers,
      topCountries,
      topBrowsers,
      topDevices,
      dailyStats,
    ] = await Promise.all([
      Link.countDocuments(),
      LinkAnalytics.countDocuments(),
      User.countDocuments(),
      LinkAnalytics.aggregate([
        { $group: { _id: "$geo.country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      LinkAnalytics.aggregate([
        { $group: { _id: "$userAgent.browser", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      LinkAnalytics.aggregate([
        { $group: { _id: "$userAgent.device", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      LinkAnalytics.aggregate([
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    return {
      summary: {
        totalLinks,
        totalClicks,
        totalUsers,
      },
      topCountries,
      topBrowsers,
      topDevices,
      dailyStats,
    };
  }
}

export default AdminService;
