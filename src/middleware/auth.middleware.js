import { verifyAccessToken } from "../utils/jwt.js";
import { User } from "../models/User.js";

const extractToken = (request) => {
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  if (request.cookies?.accessToken) {
    return request.cookies.accessToken;
  }

  return null;
};

export const authenticate = async (request, reply) => {
  try {
    const token = extractToken(request);

    if (!token) {
      request.user = null;
      return;
    }

    const result = verifyAccessToken(token);

    if (!result.valid) {
      request.user = null;
      return;
    }

    const user = await User.findById(result.decoded.userId)
      .select("-password -__v -refreshToken")
      .lean();

    if (!user || !user.isActive) {
      request.user = null;
      return;
    }

    request.user = user;
  } catch (error) {
    request.user = null;
  }
};

export const requireAuth = async (request, reply) => {
  if (!request.user) {
    if (request.headers.accept?.includes("application/json")) {
      return reply.status(401).send({
        success: false,
        message: "Authentication required",
      });
    }
    return reply.redirect("/login");
  }
};

export const nextOnAuth = async (request, reply) => {
  if (!request.user) {
    return reply.status(401).send({
      success: false,
      message: "Unauthorized",
    });
  }
};

export const requireAdmin = async (request, reply) => {
  if (!request.user) {
    if (request.headers.accept?.includes("application/json")) {
      return reply.status(401).send({
        success: false,
        message: "Authentication required",
      });
    }
    return reply.redirect("/login");
  }

  if (request.user.role !== "admin") {
    return reply.status(403).send({
      success: false,
      message: "Access denied",
    });
  }
};

export const requireRole = (...roles) => {
  return async (request, reply) => {
    if (!request.user) {
      if (request.headers.accept?.includes("application/json")) {
        return reply.status(401).send({
          success: false,
          message: "Authentication required",
        });
      }
      return reply.redirect("/login");
    }

    if (!roles.includes(request.user.role)) {
      if (request.headers.accept?.includes("application/json")) {
        return reply.status(403).send({
          success: false,
          message: "You do not have permission to access this resource",
        });
      }
      return reply.status(403).view("error.ejs", {
        error: {
          message: "You do not have permission to access this page",
          statusCode: 403,
        },
        user: request.user,
      });
    }
  };
};
