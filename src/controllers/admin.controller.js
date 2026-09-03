import { AdminService } from "../services/admin.service.js";
import { AppError } from "../utils/AppError.js";

export class AdminController {
  static async getDashboardStats(request, reply) {
    try {
      const stats = await AdminService.getDashboardStats();
      return reply.send({ success: true, data: stats });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async getSystemStats(request, reply) {
    try {
      const stats = await AdminService.getSystemStats();
      return reply.send({ success: true, data: stats });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async getUsers(request, reply) {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 20;
      const filters = {
        isActive: request.query.isActive,
        role: request.query.role,
        search: request.query.search,
      };

      const result = await AdminService.getAllUsers(page, limit, filters);
      return reply.send({ success: true, ...result });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async getUserDetails(request, reply) {
    try {
      const user = await AdminService.getUserDetails(request.params.userId);
      return reply.send({ success: true, data: user });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async toggleUserStatus(request, reply) {
    try {
      const user = await AdminService.toggleUserStatus(
        request.params.userId,
        request.user._id,
      );

      return reply.send({ success: true, data: user });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async getLinks(request, reply) {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 20;
      const filters = {
        isActive: request.query.isActive,
        isBlacklisted: request.query.isBlacklisted,
        userId: request.query.userId,
        search: request.query.search,
      };

      const result = await AdminService.getAllLinks(page, limit, filters);
      return reply.send({ success: true, ...result });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async toggleLinkStatus(request, reply) {
    try {
      const link = await AdminService.toggleLinkStatus(request.params.linkId);
      return reply.send({ success: true, data: link });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async blacklistLink(request, reply) {
    try {
      const link = await AdminService.blacklistLink(request.params.linkId);
      return reply.send({ success: true, data: link });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async addToBlacklist(request, reply) {
    try {
      const { domain, reason, isRegex } = request.body;

      if (!domain) {
        throw AppError.badRequest("Domain or pattern is required");
      }

      const blacklist = await AdminService.addToBlacklist(
        domain,
        reason || "Blocked by admin",
        request.user._id,
        isRegex || false,
      );

      return reply.status(201).send({ success: true, data: blacklist });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async removeFromBlacklist(request, reply) {
    try {
      await AdminService.removeFromBlacklist(request.params.domainId);
      return reply.send({
        success: true,
        message: "Domain removed from blacklist",
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async getBlacklist(request, reply) {
    try {
      const page = parseInt(request.query.page) || 1;
      const limit = parseInt(request.query.limit) || 50;

      const result = await AdminService.getBlacklist(page, limit);
      return reply.send({ success: true, ...result });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }
}
