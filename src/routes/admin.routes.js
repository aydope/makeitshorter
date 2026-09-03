import { AdminController } from "../controllers/admin.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/auth.middleware.js";

export const adminRoutes = async (fastify) => {
  // Admin dashboard
  fastify.get(
    "/stats",
    { preHandler: [requireAdmin] },
    AdminController.getDashboardStats,
  );

  // Users
  fastify.get(
    "/users",
    { preHandler: [requireAdmin] },
    AdminController.getUsers,
  );
  fastify.put(
    "/users/:userId/toggle-status",
    { preHandler: [requireAdmin] },
    AdminController.toggleUserStatus,
  );

  // Links
  fastify.get(
    "/links",
    { preHandler: [requireAdmin] },
    AdminController.getLinks,
  );
  fastify.put(
    "/links/:linkId/toggle-status",
    { preHandler: [requireAdmin] },
    AdminController.toggleLinkStatus,
  );
  fastify.put(
    "/links/:linkId/blacklist",
    { preHandler: [requireAdmin] },
    AdminController.blacklistLink,
  );

  // Blacklist
  fastify.get(
    "/blacklist",
    { preHandler: [requireAdmin] },
    AdminController.getBlacklist,
  );
  fastify.post(
    "/blacklist",
    { preHandler: [requireAdmin] },
    AdminController.addToBlacklist,
  );
  fastify.delete(
    "/blacklist/:domainId",
    { preHandler: [requireAdmin] },
    AdminController.removeFromBlacklist,
  );
};
