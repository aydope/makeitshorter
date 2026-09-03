import jwt from "jsonwebtoken";
import { Configs } from "../config/env.js";

const ACCESS_SECRET = Configs.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = Configs.REFRESH_TOKEN_SECRET;
const ACCESS_EXPIRES_IN = Configs.ACCESS_TOKEN_EXPIRES_IN;
const REFRESH_EXPIRES_IN = Configs.REFRESH_TOKEN_EXPIRES_IN;

const handleJwtError = (error) => {
  const errorMap = {
    TokenExpiredError: {
      error: "EXPIRED",
      message: "Token has expired",
    },
    JsonWebTokenError: {
      error: "INVALID",
      message: "Invalid token",
    },
    NotBeforeError: {
      error: "NOT_BEFORE",
      message: "Token not active yet",
    },
  };

  const mappedError = errorMap[error.name] || {
    error: "UNKNOWN",
    message: error.message || "Unknown error occurred",
  };

  return {
    valid: false,
    ...mappedError,
  };
};

const verifyToken = (token, secret, expectedType) => {
  try {
    const decoded = jwt.verify(token, secret);

    if (decoded.type !== expectedType) {
      return {
        valid: false,
        error: "INVALID_TYPE",
        message: `Expected ${expectedType} token`,
      };
    }

    return { valid: true, decoded };
  } catch (error) {
    return handleJwtError(error);
  }
};

export const generateAccessToken = (payload) => {
  return jwt.sign({ ...payload, type: "access" }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign({ ...payload, type: "refresh" }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });
};

export const generateTokens = (payload) => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_EXPIRES_IN,
    refreshExpiresIn: REFRESH_EXPIRES_IN,
  };
};

export const verifyAccessToken = (token) => {
  return verifyToken(token, ACCESS_SECRET, "access");
};

export const verifyRefreshToken = (token) => {
  return verifyToken(token, REFRESH_SECRET, "refresh");
};

export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
};

export const getTokenExpiry = (token) => {
  const decoded = decodeToken(token);
  return decoded?.exp ? new Date(decoded.exp * 1000) : null;
};

export const isTokenExpired = (token) => {
  const expiry = getTokenExpiry(token);
  return !expiry || new Date() > expiry;
};

export const getRemainingTime = (token) => {
  const expiry = getTokenExpiry(token);
  if (!expiry) return 0;
  return Math.max(0, expiry.getTime() - Date.now());
};

export const getTokenPayload = (token) => {
  const decoded = decodeToken(token);
  if (!decoded) return null;

  const { iat, exp, ...payload } = decoded;
  return payload;
};

export const getUserIdFromToken = (token) => {
  const decoded = decodeToken(token);
  return decoded?.userId || null;
};

export const getTokenType = (token) => {
  const decoded = decodeToken(token);
  return decoded?.type || null;
};

export const refreshTokens = (refreshToken, extraPayload = {}) => {
  const result = verifyRefreshToken(refreshToken);

  if (!result.valid) {
    return {
      success: false,
      error: result.error,
      message: result.message,
    };
  }

  const { iat, exp, type, ...cleanPayload } = result.decoded;
  const newPayload = { ...cleanPayload, ...extraPayload };

  const tokens = generateTokens(newPayload);

  return {
    success: true,
    ...tokens,
  };
};

export const rotateRefreshToken = (refreshToken, extraPayload = {}) => {
  const result = verifyRefreshToken(refreshToken);

  if (!result.valid) {
    return {
      success: false,
      error: result.error,
      message: result.message,
    };
  }

  const { iat, exp, type, ...cleanPayload } = result.decoded;
  const newPayload = { ...cleanPayload, ...extraPayload };

  const newAccessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);

  return {
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_EXPIRES_IN,
    refreshExpiresIn: REFRESH_EXPIRES_IN,
    rotatedFrom: result.decoded,
  };
};
