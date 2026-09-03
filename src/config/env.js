import "dotenv/config";

export const Configs = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI,

  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",

  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:3001",

  GUEST_DAILY_LIMIT: parseInt(process.env.GUEST_DAILY_LIMIT) || 7,
  USER_DAILY_LIMIT: parseInt(process.env.USER_DAILY_LIMIT) || 28,
  ADMIN_DAILY_LIMIT: parseInt(process.env.ADMIN_DAILY_LIMIT) || 35,
};
