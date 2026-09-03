import { DailyLinkCount } from "../models/DailyLinkCount.js";
import { Configs } from "../config/env.js";

const requestCounts = new Map();
const guestLinkCounts = new Map();

const cleanupMaps = () => {
  const now = Date.now();
  const windowMs = 60 * 1000;

  for (const [key, timestamps] of requestCounts) {
    const recent = timestamps.filter((ts) => now - ts < windowMs);
    if (recent.length === 0) {
      requestCounts.delete(key);
    } else {
      requestCounts.set(key, recent);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  for (const [key, data] of guestLinkCounts) {
    if (data.date !== today) {
      guestLinkCounts.delete(key);
    }
  }
};

setInterval(cleanupMaps, 5 * 60 * 1000);

export const requestRateLimit = async (request, reply) => {
  const ip = request.ip;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxRequests = 1000;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const timestamps = requestCounts.get(ip);
  const recentRequests = timestamps.filter((ts) => now - ts < windowMs);

  if (recentRequests.length >= maxRequests) {
    return reply.status(429).view("error.ejs", {
      error: {
        statusCode: 429,
        message: "Too many requests. Please try again in a minute.",
      },
      user: request.user || null,
    });
  }

  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
};

const generateGuestId = () => {
  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const getGuestData = (guestId, limit) => {
  const today = new Date().toISOString().split("T")[0];
  let data = guestLinkCounts.get(guestId);

  if (!data || data.date !== today) {
    data = { used: 0, limit, date: today };
    guestLinkCounts.set(guestId, data);
  }

  return data;
};

export const linkCreationLimit = async (request, reply) => {
  const today = new Date().toISOString().split("T")[0];

  if (request.user) {
    const userId = request.user._id;
    const limit =
      request.user.role === "admin"
        ? Configs.ADMIN_DAILY_LIMIT
        : Configs.USER_DAILY_LIMIT;

    const dailyCount = await DailyLinkCount.findOne({
      userId,
      date: today,
    }).lean();
    const currentCount = dailyCount?.count || 0;

    if (currentCount >= limit) {
      return reply.status(429).send({
        success: false,
        message: `Daily limit reached. You can create ${limit} links per day.`,
        limit,
        current: currentCount,
      });
    }

    request._dailyData = {
      userId,
      dateStr: today,
      isGuest: false,
      currentCount,
      limit,
    };
    return;
  }

  const limit = Configs.GUEST_DAILY_LIMIT;
  let guestId = request.cookies?.guest_id;

  if (!guestId) {
    guestId = generateGuestId();
    guestLinkCounts.set(guestId, { used: 0, limit, date: today });

    reply.setCookie("guest_id", guestId, {
      httpOnly: true,
      secure: Configs.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
  }

  const guestData = getGuestData(guestId, limit);
  const currentCount = guestData.used;

  if (currentCount >= limit) {
    return reply.status(429).send({
      success: false,
      message: `Daily limit reached. You can create ${limit} links per day.`,
      limit,
      current: currentCount,
    });
  }

  request._dailyData = {
    userId: guestId,
    dateStr: today,
    isGuest: true,
    currentCount,
    limit,
  };
};

export const incrementDailyCount = async (request, reply) => {
  const data = request._dailyData;
  if (!data) return null;

  if (data.isGuest) {
    const guestData = guestLinkCounts.get(data.userId);
    if (guestData) {
      guestData.used += 1;
      guestLinkCounts.set(data.userId, guestData);
      return { used: guestData.used, limit: guestData.limit };
    }
    return null;
  }

  const result = await DailyLinkCount.findOneAndUpdate(
    { userId: data.userId, date: data.dateStr },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  );
  return result;
};

export default {
  linkCreationLimit,
  incrementDailyCount,
};
