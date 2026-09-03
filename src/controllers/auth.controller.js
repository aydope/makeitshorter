import { AuthService } from "../services/auth.service.js";
import { User } from "../models/User.js";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "../utils/validators.js";
import { refreshTokens, getTokenExpiry } from "../utils/jwt.js";

export class AuthController {
  static async register(request, reply) {
    try {
      const { error, value } = registerSchema.validate(request.body);

      if (error) {
        return reply.status(400).send({
          success: false,
          message: error.details[0].message,
        });
      }

      const { user, tokens } = await AuthService.register(value);

      reply.setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      reply.setCookie("accessToken", tokens.accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60 * 1000,
      });

      return reply.send({
        success: true,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async login(request, reply) {
    try {
      const { error, value } = loginSchema.validate(request.body);

      if (error) {
        return reply.status(400).send({
          success: false,
          message: error.details[0].message,
        });
      }

      const { user, tokens } = await AuthService.login(
        value.email,
        value.password,
      );

      reply.setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      reply.setCookie("accessToken", tokens.accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60 * 1000,
      });

      return reply.send({
        success: true,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async refreshToken(request, reply) {
    try {
      const refreshToken =
        request.cookies?.refreshToken || request.body?.refreshToken;

      if (!refreshToken) {
        return reply.status(401).send({
          success: false,
          message: "Refresh token not found",
        });
      }

      const tokens = await AuthService.refreshTokens(refreshToken);

      reply.setCookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      reply.setCookie("accessToken", tokens.accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60 * 1000,
      });

      return reply.send({
        success: true,
        accessToken: tokens.accessToken,
        userId: tokens.user._id,
        userRole: tokens.user.role,
      });
    } catch (err) {
      return reply.status(401).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async logout(request, reply) {
    reply.clearCookie("refreshToken", { path: "/" });
    reply.clearCookie("accessToken", { path: "/" });
    return reply.send({
      success: true,
      message: "Logged out successfully",
    });
  }

  static async getProfile(request, reply) {
    try {
      const user = await AuthService.getProfile(request.user._id);
      return reply.send({ success: true, user });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async updateProfile(request, reply) {
    try {
      const { error, value } = updateProfileSchema.validate(request.body);

      if (error) {
        return reply.status(400).send({
          success: false,
          message: error.details[0].message,
        });
      }

      const user = await AuthService.updateProfile(request.user._id, value);
      return reply.send({ success: true, user });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }

  static async changePassword(request, reply) {
    try {
      const { error, value } = changePasswordSchema.validate(request.body);

      if (error) {
        return reply.status(400).send({
          success: false,
          message: error.details[0].message,
        });
      }

      const { currentPassword, newPassword } = value;

      const user = await User.findById(request.user._id);
      const isPasswordValid = await user.comparePassword(currentPassword);

      if (!isPasswordValid) {
        return reply.status(400).send({
          success: false,
          message: "Current password is incorrect",
        });
      }

      user.password = newPassword;
      await user.save();

      return reply.send({
        success: true,
        message: "Password changed successfully",
      });
    } catch (err) {
      return reply.status(err.statusCode || 500).send({
        success: false,
        message: err.message,
      });
    }
  }
}
