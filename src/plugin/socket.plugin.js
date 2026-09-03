import fp from "fastify-plugin";
import { Server } from "socket.io";
import { Configs } from "../config/env.js";
import { verifyAccessToken } from "../utils/jwt.js";

let ioInstance = null;

const onlineUsers = new Map();
const onlineGuests = new Set();

const getOnlineStats = () => ({
  total: onlineUsers.size + onlineGuests.size,
  users: onlineUsers.size,
  guests: onlineGuests.size,
  userIds: Array.from(onlineUsers.keys()),
  timestamp: new Date().toISOString(),
});

const extractToken = (socket) => {
  if (socket.handshake.auth?.token) {
    return socket.handshake.auth.token;
  }

  const authHeader = socket.handshake.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split("; ").reduce((acc, cookie) => {
      const [key, ...valueParts] = cookie.split("=");
      acc[key] = valueParts.join("=");
      return acc;
    }, {});
    return cookies.accessToken || null;
  }

  return null;
};

const emitOnlineStats = (io) => {
  io.emit("online-stats", getOnlineStats());
};

async function socketPlugin(fastify, options) {
  const allowedOrigins = Configs.CORS_ORIGIN?.split(",") || [
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  const io = new Server(fastify.server, {
    cors: {
      origin: (origin, cb) => {
        if (Configs.NODE_ENV === "development") {
          return cb(null, true);
        }

        if (!origin || allowedOrigins.includes(origin)) {
          return cb(null, true);
        }

        return cb(new Error(`Origin ${origin} not allowed by CORS`), false);
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    path: "/socket.io/",
    serveClient: false,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e6,
    allowEIO3: true,
    cookie: false,
  });

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);

      socket.isAuthenticated = false;
      socket.userId = null;
      socket.user = null;

      if (!token) {
        return next();
      }

      const { valid, decoded } = verifyAccessToken(token);

      if (!valid) {
        return next();
      }

      socket.userId = decoded.userId;
      socket.user = decoded;
      socket.isAuthenticated = true;
      next();
    } catch {
      socket.isAuthenticated = false;
      socket.userId = null;
      socket.user = null;
      next();
    }
  });

  io.on("connection", (socket) => {
    const { isAuthenticated, userId } = socket;

    if (isAuthenticated && userId) {
      onlineUsers.set(userId, socket.id);
    } else {
      onlineGuests.add(socket.id);
    }

    emitOnlineStats(io);

    socket.on("join-dashboard", (userData) => {
      const userId = userData?._id || userData;

      if (userId) {
        socket.join(`user-${userId}`);
        socket.emit("dashboard-joined", {
          userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on("join-admin-dashboard", () => {
      if (socket.user?.role === "admin") {
        socket.join("admin-dashboard");
        socket.emit("admin-dashboard-joined", {
          userId: socket.userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      } else {
        socket.emit("error", {
          message: "Access denied. Admin role required.",
        });
      }
    });

    socket.on("get-online-stats", () => {
      socket.emit("online-stats", getOnlineStats());
    });

    socket.on("disconnect", () => {
      if (isAuthenticated && userId) {
        onlineUsers.delete(userId);
      } else {
        onlineGuests.delete(socket.id);
      }

      emitOnlineStats(io);
    });

    socket.on("error", (error) => {
      fastify.log.error(`Socket error: ${socket.id}`, error.message);
    });
  });

  fastify.decorate("io", io);
  fastify.decorate("onlineUsers", {
    getTotal: () => onlineUsers.size + onlineGuests.size,
    getUsers: () => onlineUsers.size,
    getGuests: () => onlineGuests.size,
    getUserIds: () => Array.from(onlineUsers.keys()),
    isUserOnline: (userId) => onlineUsers.has(userId),
    getSocketId: (userId) => onlineUsers.get(userId) || null,
    getAll: () => {
      return Array.from(onlineUsers, ([userId, socketId]) => ({
        userId,
        socketId,
      }));
    },
    getStats: getOnlineStats,
  });

  ioInstance = io;

  if (typeof global !== "undefined") {
    global.__io = io;
  }

  fastify.addHook("onClose", async () => {
    await io.close();
    ioInstance = null;
    onlineUsers.clear();
    onlineGuests.clear();

    if (typeof global !== "undefined") {
      global.__io = null;
    }

    fastify.log.info("Socket.IO server closed");
  });

  fastify.log.info("Socket.IO plugin registered");
}

export const getIO = () => {
  if (!ioInstance && typeof global !== "undefined" && global.__io) {
    ioInstance = global.__io;
  }

  if (!ioInstance) {
    throw new Error("Socket.IO not initialized");
  }

  return ioInstance;
};

export default fp(socketPlugin, { name: "socket" });
