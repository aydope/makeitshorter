import { nanoid } from "nanoid";
import { Link } from "../models/Link.js";

const MAX_ATTEMPTS = 5;
const DEFAULT_LENGTH = 8;

const sanitizeCustomCode = (customCode) => {
  if (!customCode || typeof customCode !== "string") {
    return null;
  }

  const sanitized = customCode
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, "");

  return sanitized || null;
};

const isCodeExists = async (code) => {
  const existingLink = await Link.findOne({ shortCode: code })
    .select("_id")
    .lean();
  return !!existingLink;
};

const generateUniqueCode = async (length = DEFAULT_LENGTH, attempts = 0) => {
  if (attempts >= MAX_ATTEMPTS) {
    throw new Error("Failed to generate unique code");
  }

  const code = nanoid(length);
  const exists = await isCodeExists(code);

  if (exists) {
    return generateUniqueCode(length, attempts + 1);
  }

  return code;
};

export const generateShortCode = async (customCode = null) => {
  if (customCode) {
    const sanitized = sanitizeCustomCode(customCode);

    if (!sanitized) {
      throw new Error("Invalid custom code");
    }

    const exists = await isCodeExists(sanitized);
    if (exists) {
      throw new Error("Custom code already exists");
    }

    return sanitized;
  }

  return generateUniqueCode(DEFAULT_LENGTH);
};
