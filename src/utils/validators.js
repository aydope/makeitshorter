import Joi from "joi";

const urlMessages = {
  "string.uri": "Please enter a valid URL starting with http:// or https://",
  "string.empty": "URL is required",
  "any.required": "URL is required",
};

const customCodeMessages = {
  "string.pattern.base":
    "Custom code can only contain letters, numbers, hyphens and underscores",
  "string.min": "Custom code must be at least 3 characters",
  "string.max": "Custom code cannot exceed 20 characters",
};

const usernameMessages = {
  "string.pattern.base":
    "Username can only contain letters, numbers, underscores and dots",
  "string.min": "Username must be at least 3 characters",
  "string.max": "Username cannot exceed 30 characters",
  "string.empty": "Username is required",
  "any.required": "Username is required",
};

export const registerSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9._]+$/)
    .min(3)
    .max(30)
    .required()
    .messages(usernameMessages),
  email: Joi.string().email().required().messages({
    "string.email": "Please enter a valid email address",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
  password: Joi.string().min(6).max(128).required().messages({
    "string.min": "Password must be at least 6 characters",
    "string.max": "Password cannot exceed 128 characters",
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please enter a valid email address",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

export const createLinkSchema = Joi.object({
  originalUrl: Joi.string()
    .uri({
      scheme: ["http", "https"],
      allowRelative: false,
      domain: { minDomainSegments: 2 },
    })
    .required()
    .messages(urlMessages),
  customCode: Joi.string()
    .min(3)
    .max(20)
    .pattern(/^[a-zA-Z0-9-_]+$/)
    .allow("", null)
    .messages(customCodeMessages),
  title: Joi.string().max(100).allow("", null).messages({
    "string.max": "Title cannot exceed 100 characters",
  }),
});

export const updateLinkSchema = Joi.object({
  title: Joi.string().max(100).allow("", null).messages({
    "string.max": "Title cannot exceed 100 characters",
  }),
  originalUrl: Joi.string()
    .uri({
      scheme: ["http", "https"],
      allowRelative: false,
      domain: { minDomainSegments: 2 },
    })
    .messages(urlMessages),
  isActive: Joi.boolean().messages({
    "boolean.base": "isActive must be a boolean",
  }),
});

export const updateProfileSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9._]+$/)
    .min(3)
    .max(30)
    .messages(usernameMessages),
  email: Joi.string().email().messages({
    "string.email": "Please enter a valid email address",
  }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "string.empty": "Current password is required",
    "any.required": "Current password is required",
  }),
  newPassword: Joi.string().min(6).max(128).required().messages({
    "string.min": "New password must be at least 6 characters",
    "string.max": "New password cannot exceed 128 characters",
    "string.empty": "New password is required",
    "any.required": "New password is required",
  }),
});
