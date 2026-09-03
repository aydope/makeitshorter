import { LinkController } from "../controllers/link.controller.js";
import { authenticate, nextOnAuth } from "../middleware/auth.middleware.js";
import { linkCreationLimit } from "../middleware/rateLimit.middleware.js";
import { DailyLinkCount } from "../models/DailyLinkCount.js";
import { Blacklist } from "../models/Blacklist.js";
import { Configs } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const getDailyStats = async (request, reply) => {
  const today = new Date().toISOString().split("T")[0];
  const userId = request.user._id;

  const limit =
    request.user.role === "admin"
      ? Configs.ADMIN_DAILY_LIMIT
      : Configs.USER_DAILY_LIMIT;

  const dailyCount = await DailyLinkCount.findOne({
    userId,
    date: today,
  }).lean();

  const used = dailyCount?.count || 0;
  const remaining = Math.max(0, limit - used);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const msUntilReset = tomorrow - now;
  const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60));
  const minutesUntilReset = Math.floor(
    (msUntilReset % (1000 * 60 * 60)) / (1000 * 60),
  );

  return reply.send({
    success: true,
    used,
    limit,
    remaining,
    resetIn: `${hoursUntilReset}h ${minutesUntilReset}m`,
    resetTime: tomorrow.toISOString(),
  });
};

const checkUrlBlacklist = async (request, reply) => {
  const { url } = request.body;

  if (!url) {
    throw AppError.badRequest("URL is required");
  }

  try {
    const urlObj = new URL(url);
    const fullUrl = url.toLowerCase();
    const domain = urlObj.hostname.toLowerCase();

    const entries = await Blacklist.find({}).lean();

    for (const entry of entries) {
      const entryDomain = entry.domain.toLowerCase();
      let isBlocked = false;

      try {
        const regex = new RegExp(entry.domain, "i");
        isBlocked = regex.test(fullUrl) || regex.test(domain);
      } catch {
        isBlocked =
          fullUrl.includes(entryDomain) || domain.includes(entryDomain);
      }

      if (isBlocked) {
        return reply.send({
          blacklisted: true,
          reason: entry.reason || "Blocked by admin",
        });
      }
    }

    return reply.send({ blacklisted: false });
  } catch {
    return reply.send({ blacklisted: false });
  }
};

export const linkRoutes = async (fastify) => {
  fastify.post(
    "/shorten",
    {
      preHandler: [linkCreationLimit],
    },
    LinkController.createLink,
  );

  fastify.get(
    "/my-links",
    { preHandler: [nextOnAuth] },
    LinkController.getUserLinks,
  );

  fastify.put(
    "/:linkId",
    { preHandler: [nextOnAuth] },
    LinkController.updateLink,
  );

  fastify.delete(
    "/:linkId",
    { preHandler: [nextOnAuth] },
    LinkController.deleteLink,
  );

  fastify.get(
    "/:linkId/stats",
    { preHandler: [authenticate] },
    LinkController.getLinkStats,
  );

  fastify.get("/daily-stats", { preHandler: [authenticate] }, getDailyStats);

  fastify.post("/check-url", checkUrlBlacklist);
};
