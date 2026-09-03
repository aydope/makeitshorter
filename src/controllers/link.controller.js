import { LinkService } from "../services/link.service.js";
import { createLinkSchema, updateLinkSchema } from "../utils/validators.js";
import { incrementDailyCount } from "../middleware/rateLimit.middleware.js";
import { DailyLinkCount } from "../models/DailyLinkCount.js";
import { Configs } from "../config/env.js";

export class LinkController {
  static async createLink(request, reply) {
    try {
      if (!request._dailyData) {
        return reply.status(429).send({
          success: false,
          message: "Daily limit reached. Please try again later.",
        });
      }

      const { error, value } = createLinkSchema.validate(request.body);
      if (error) {
        return reply.status(400).send({
          success: false,
          message: error.details[0].message,
        });
      }

      const userId = request.user?._id || null;
      const link = await LinkService.createLink(value, userId);

      await incrementDailyCount(request, reply);

      const data = request._dailyData;
      const finalCount = data.currentCount + 1;
      const remaining = Math.max(0, data.limit - finalCount);

      return reply.status(201).send({
        success: true,
        link,
        dailyStats: {
          used: finalCount,
          limit: data.limit,
          remaining,
        },
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async redirectLink(request, reply) {
    try {
      const { shortCode } = request.params;
      const originalUrl = await LinkService.redirectLink(shortCode, request);

      return reply.redirect(originalUrl);
    } catch (err) {
      return reply.status(err.statusCode || 500).view("error.ejs", {
        error: { message: err.message, statusCode: err.statusCode || 404 },
        user: request.user || null,
      });
    }
  }

  static async getUserLinks(request, reply) {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 10;
      const search = request.query.search || "";

      const result = await LinkService.getUserLinks(
        request.user._id,
        page,
        limit,
        search,
      );

      return reply.send({
        success: true,
        ...result,
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async updateLink(request, reply) {
    try {
      const { error, value } = updateLinkSchema.validate(request.body);

      if (error) {
        return reply.status(400).send({
          success: false,
          message: error.details[0].message,
        });
      }

      const link = await LinkService.updateLink(
        request.params.linkId,
        request.user._id,
        value,
      );

      return reply.send({
        success: true,
        link,
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async deleteLink(request, reply) {
    try {
      await LinkService.deleteLink(request.params.linkId, request.user._id);

      return reply.send({
        success: true,
        message: "Link deleted successfully",
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async getLinkStats(request, reply) {
    try {
      const stats = await LinkService.getLinkStats(
        request.params.linkId,
        request.user._id,
      );

      return reply.send({
        success: true,
        ...stats,
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }
}
