import { User } from "../models/User.js";
import {
  generateTokens,
  generateAccessToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";

export class AuthService {
  static async register(userData) {
    const existingUser = await User.findOne({
      $or: [{ email: userData.email }, { username: userData.username }],
    });

    if (existingUser) {
      if (existingUser.email === userData.email) {
        throw AppError.conflict("Email already exists");
      }
      if (existingUser.username === userData.username) {
        throw AppError.conflict("Username already exists");
      }
    }

    const user = await User.create({
      username: userData.username,
      email: userData.email,
      password: userData.password,
    });

    const tokens = generateTokens({ userId: user._id, role: user.role });

    return { user: this.sanitizeUser(user), tokens };
  }

  static async login(email, password) {
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      throw AppError.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw AppError.forbidden(
        "Your account has been deactivated. Please contact support.",
      );
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw AppError.unauthorized("Invalid email or password");
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const tokens = generateTokens({ userId: user._id, role: user.role });

    return { user: this.sanitizeUser(user), tokens };
  }

  static async refreshTokens(refreshToken) {
    const result = verifyRefreshToken(refreshToken);

    if (!result.valid) {
      throw AppError.unauthorized(result.message || "Invalid refresh token");
    }

    const user = await User.findById(result.decoded.userId);

    if (!user || !user.isActive) {
      throw AppError.unauthorized("Invalid refresh token");
    }

    const tokens = generateTokens({ userId: user._id, role: user.role });

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  static async rotateRefreshToken(refreshToken) {
    const result = verifyRefreshToken(refreshToken);

    if (!result.valid) {
      throw AppError.unauthorized(result.message || "Invalid refresh token");
    }

    const user = await User.findById(result.decoded.userId);

    if (!user || !user.isActive) {
      throw AppError.unauthorized("Invalid refresh token");
    }

    const newAccessToken = generateAccessToken({
      userId: user._id,
      role: user.role,
    });

    return {
      accessToken: newAccessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  static async getProfile(userId) {
    const user = await User.findById(userId).select("-password -__v");

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  }

  static async updateProfile(userId, updateData) {
    const allowedUpdates = ["username", "email"];
    const updates = {};

    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        updates[key] =
          key === "email"
            ? updateData[key].toLowerCase().trim()
            : updateData[key].trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      throw AppError.badRequest("No valid fields to update");
    }

    if (updates.username) {
      const usernameExists = await User.findOne({
        username: updates.username,
        _id: { $ne: userId },
      });

      if (usernameExists) {
        throw AppError.conflict("Username already exists");
      }
    }

    if (updates.email) {
      const emailExists = await User.findOne({
        email: updates.email,
        _id: { $ne: userId },
      });

      if (emailExists) {
        throw AppError.conflict("Email already exists");
      }
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password -__v");

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  }

  static async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId);

    if (!user) {
      throw AppError.notFound("User not found");
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw AppError.unauthorized("Current password is incorrect");
    }

    user.password = newPassword;
    await user.save();

    return { success: true, message: "Password changed successfully" };
  }

  static async checkAvailability(field, value) {
    const allowedFields = ["username", "email"];

    if (!allowedFields.includes(field)) {
      throw AppError.badRequest(
        "Invalid field. Allowed fields: username, email",
      );
    }

    if (!value || typeof value !== "string") {
      throw AppError.badRequest("Value is required");
    }

    const normalizedValue = value.toLowerCase().trim();

    const user = await User.findOne({
      [field]: normalizedValue,
    })
      .select("_id")
      .lean();

    return {
      field,
      value: normalizedValue,
      available: !user,
      message: user
        ? `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
        : `${field.charAt(0).toUpperCase() + field.slice(1)} is available`,
    };
  }

  static async checkAvailabilityBulk(fields) {
    const results = {};
    const queries = [];

    if (fields.username) {
      queries.push({
        field: "username",
        value: fields.username.toLowerCase().trim(),
      });
    }

    if (fields.email) {
      queries.push({
        field: "email",
        value: fields.email.toLowerCase().trim(),
      });
    }

    if (queries.length === 0) {
      throw AppError.badRequest(
        "At least one field (username or email) is required",
      );
    }

    for (const query of queries) {
      const user = await User.findOne({
        [query.field]: query.value,
      })
        .select("_id")
        .lean();

      results[query.field] = {
        available: !user,
        message: user
          ? `${query.field.charAt(0).toUpperCase() + query.field.slice(1)} already exists`
          : `${query.field.charAt(0).toUpperCase() + query.field.slice(1)} is available`,
      };
    }

    return results;
  }

  static sanitizeUser(user) {
    const userObj = user.toObject ? user.toObject() : user;
    const { password, __v, ...sanitizedUser } = userObj;
    return sanitizedUser;
  }
}

export default AuthService;
