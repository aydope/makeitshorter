export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message = "Bad Request",
    errorCode = "BAD_REQUEST",
    details = null,
  ) {
    return new AppError(message, 400, errorCode, details);
  }

  static unauthorized(
    message = "Unauthorized",
    errorCode = "UNAUTHORIZED",
    details = null,
  ) {
    return new AppError(message, 401, errorCode, details);
  }

  static forbidden(
    message = "Forbidden",
    errorCode = "FORBIDDEN",
    details = null,
  ) {
    return new AppError(message, 403, errorCode, details);
  }

  static notFound(
    message = "Not Found",
    errorCode = "NOT_FOUND",
    details = null,
  ) {
    return new AppError(message, 404, errorCode, details);
  }

  static gone(message = "Gone", errorCode = "GONE", details = null) {
    return new AppError(message, 410, errorCode, details);
  }

  static conflict(
    message = "Conflict",
    errorCode = "CONFLICT",
    details = null,
  ) {
    return new AppError(message, 409, errorCode, details);
  }

  static validationError(
    message = "Validation Error",
    errorCode = "VALIDATION_ERROR",
    details = null,
  ) {
    return new AppError(message, 422, errorCode, details);
  }

  static tooManyRequests(
    message = "Too Many Requests",
    errorCode = "TOO_MANY_REQUESTS",
    details = null,
  ) {
    return new AppError(message, 429, errorCode, details);
  }

  static internal(
    message = "Internal Server Error",
    errorCode = "INTERNAL_ERROR",
    details = null,
  ) {
    return new AppError(message, 500, errorCode, details);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV === "development" && { stack: this.stack }),
    };
  }

  log() {
    console.error({
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    });
    return this;
  }
}
