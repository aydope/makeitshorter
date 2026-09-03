import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import fastifyFormbody from "@fastify/formbody";
import ejs from "ejs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { Configs } from "./config/env.js";
import { connectDB } from "./config/database.js";
import { authRoutes } from "./routes/auth.routes.js";
import { linkRoutes } from "./routes/link.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { LinkController } from "./controllers/link.controller.js";
import { requestRateLimit } from "./middleware/rateLimit.middleware.js";
import corsPlugin from "./plugin/cors.plugin.js";
import helmetPlugin from "./plugin/helmet.plugin.js";
import fastifySettings from "./utils/fastify.settings.js";
import socketPlugin from "./plugin/socket.plugin.js";
import { requireRole } from "./middleware/auth.middleware.js";
import { setupGracefulShutdown } from "./utils/gracefulShutdown.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify(fastifySettings);

const joinDir = (dir) => {
  if (!dir) return "";
  return join(__dirname, dir);
};

const registerPlugins = async () => {
  await fastify.register(socketPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(fastifyFormbody);

  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        if (!body || body.trim() === "") {
          return done(null, {});
        }
        const json = JSON.parse(body);
        done(null, json);
      } catch (err) {
        done(err);
      }
    },
  );

  await fastify.register(fastifyCookie, {
    secret: Configs.COOKIE_SECRET,
    parseOptions: {
      httpOnly: true,
      secure: Configs.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });

  await fastify.register(fastifyStatic, {
    root: joinDir("../public"),
    prefix: "/",
  });

  await fastify.register(fastifyView, {
    engine: { ejs },
    root: joinDir("views"),
    layout: false,
    viewExt: "ejs",
  });
};

const registerHooks = () => {
  fastify.addHook("preHandler", requestRateLimit);
  fastify.addHook("preHandler", authenticate);
};

const registerPages = () => {
  fastify.get("/", async (request, reply) => {
    return reply.view("index.ejs", { user: request.user || null });
  });

  fastify.get("/login", async (request, reply) => {
    if (request.user) return reply.redirect("/dashboard");
    return reply.view("login.ejs", { user: null });
  });

  fastify.get("/register", async (request, reply) => {
    if (request.user) return reply.redirect("/dashboard");
    return reply.view("register.ejs", { user: null });
  });

  fastify.get("/dashboard", async (request, reply) => {
    if (!request.user) return reply.redirect("/login?redirect=/dashboard");
    return reply.view("dashboard.ejs", {
      user: request.user,
      page: "dashboard",
    });
  });

  fastify.get("/admin/dashboard", async (request, reply) => {
    if (!request.user)
      return reply.redirect("/login?redirect=/admin/dashboard");
    if (request.user.role !== "admin") {
      return reply.status(403).view("error.ejs", {
        error: { message: "Access denied", statusCode: 403 },
        user: request.user,
      });
    }

    return reply.view("admin/dashboard.ejs", {
      user: request.user,
      page: "admin-dashboard",
    });
  });

  fastify.get("/l/:shortCode", async (request, reply) => {
    return LinkController.redirectLink(request, reply);
  });

  fastify.get("/stats/:shortCode", async (request, reply) => {
    if (!request.user) {
      return reply.redirect(
        "/login?redirect=/stats/" + request.params.shortCode,
      );
    }

    const { shortCode } = request.params;

    try {
      const { Link } = await import("./models/Link.js");
      const link = await Link.findOne({
        shortCode: shortCode.toLowerCase(),
        userId: request.user._id,
      }).lean();

      if (!link) {
        return reply.status(404).view("error.ejs", {
          error: {
            message: "Link not found or you don't have permission",
            statusCode: 404,
          },
          user: request.user,
        });
      }

      return reply.view("stats.ejs", {
        user: request.user,
        link: link,
        page: "stats",
      });
    } catch (error) {
      console.error("Error loading stats page:", error);
      return reply.status(500).view("error.ejs", {
        error: { message: "Failed to load statistics", statusCode: 500 },
        user: request.user,
      });
    }
  });

  fastify.get(
    "/api/analytics/:linkId",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { linkId } = request.params;
        const { period = "7d" } = request.query;
        const userId = request.user._id;

        const { Link } = await import("./models/Link.js");
        const link = await Link.findOne({
          _id: linkId,
          userId: userId,
        }).lean();

        if (!link) {
          return reply.status(404).send({
            success: false,
            message: "Link not found",
          });
        }

        const { LinkService } = await import("./services/link.service.js");
        const analytics = await LinkService.getLinkAnalytics(
          linkId,
          userId,
          period,
        );

        return reply.send({
          success: true,
          data: analytics,
        });
      } catch (err) {
        console.error("Analytics error:", err);
        return reply.status(err.statusCode || 500).send({
          success: false,
          message: err.message,
        });
      }
    },
  );
};

const registerApiRoutes = async () => {
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(linkRoutes, { prefix: "/api/links" });
  await fastify.register(adminRoutes, { prefix: "/api/admin" });

  fastify.get(
    "/api/stats/online-stats",
    {
      preHandler: [authenticate, requireRole("admin")],
    },
    async (request, reply) => {
      try {
        const onlineUsers = request.server.onlineUsers;

        if (!onlineUsers) {
          return reply.send({
            success: true,
            data: {
              total: 0,
              users: 0,
              guests: 0,
              userIds: [],
              timestamp: new Date().toISOString(),
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            total: onlineUsers.getTotal ? onlineUsers.getTotal() : 0,
            users: onlineUsers.getUsers ? onlineUsers.getUsers() : 0,
            guests: onlineUsers.getGuests ? onlineUsers.getGuests() : 0,
            userIds: onlineUsers.getUserIds ? onlineUsers.getUserIds() : [],
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          message: error.message,
        });
      }
    },
  );
};

const registerErrorHandlers = () => {
  fastify.setNotFoundHandler((request, reply) => {
    const isDev = Configs.NODE_ENV === "development";

    fastify.log.warn({
      message: "Page not found",
      url: request.url,
      method: request.method,
      ip: request.ip,
    });

    return reply.status(404).view("error", {
      error: {
        message: "Page Not Found",
        statusCode: 404,
        ...(isDev && { url: request.url }),
      },
      user: request.user || null,
    });
  });

  fastify.setErrorHandler((error, request, reply) => {
    const isDev = Configs.NODE_ENV === "development";

    fastify.log.error({
      error: error.message,
      stack: error.stack,
      statusCode: error.statusCode || 500,
      url: request.url,
      method: request.method,
      ip: request.ip,
    });

    const statusCode = error.statusCode || 500;
    const message = error.isOperational
      ? error.message
      : "Internal Server Error";

    return reply.status(statusCode).view("error.ejs", {
      error: {
        message,
        statusCode,
        ...(isDev && { stack: error.stack }),
      },
      user: request.user || null,
    });
  });
};

const initializeApp = async () => {
  await registerPlugins();
  registerHooks();
  registerPages();
  await registerApiRoutes();
  registerErrorHandlers();
  global.__io = fastify.io;
};

const start = async () => {
  try {
    await connectDB();
    await initializeApp();

    await fastify.listen({ port: Configs.PORT, host: "0.0.0.0" });
    console.log(`Server running on http://localhost:${Configs.PORT}`);

    const shutdownHandler = setupGracefulShutdown(fastify.server, {
      timeout: 15000,
      exitOnUnhandled: true,
      onShutdown: async () => {
        console.log("Closing socket connections...");
        if (fastify.io) {
          fastify.io.close();
        }
      },
    });

    shutdownHandler.addCleanupTask(async () => {
      console.log("Cleaning up resources...");
      if (fastify.io) {
        await new Promise((resolve) => {
          fastify.io.close(() => {
            console.log("Socket.io closed");
            resolve();
          });
        });
      }
    });

    shutdownHandler.addCleanupTask(async () => {
      console.log("Final cleanup...");
      if (global.__io) {
        delete global.__io;
      }
    });
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
};

start();
