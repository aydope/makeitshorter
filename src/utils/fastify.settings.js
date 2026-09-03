import { Configs } from "../config/env.js";

const loggerConfig = {
  development: {
    transport: {
      target: "pino-pretty",
      options: {
        ignore: "pid,hostname",
        translateTime: "HH:MM:ss Z",
        colorize: true,
        levelFirst: true,
        singleLine: false,
        hideObject: false,
      },
    },
  },
  production: {
    level: "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.token",
        "req.body.secret",
      ],
      censor: "[REDACTED]",
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket?.remotePort,
        };
      },
      res(reply) {
        return {
          statusCode: reply.statusCode,
        };
      },
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
  },
  test: {
    level: "silent",
  },
};

const fastifySettings = {
  logger: loggerConfig[Configs.NODE_ENV] || true,
  trustProxy: true,
  disableRequestLogging: Configs.NODE_ENV === "production",
  requestIdHeader: "x-request-id",
  requestIdLogLabel: "requestId",
  genReqId: (request) => {
    return (
      request.headers["x-request-id"] ||
      request.headers["x-correlation-id"] ||
      crypto.randomUUID()
    );
  },
  bodyLimit: 1048576,
  keepAliveTimeout: 120000,
  connectionTimeout: 60000,
  ignoreTrailingSlash: true,
  ignoreDuplicateSlashes: true,
  maxParamLength: 100,
  caseSensitive: false,
  pluginTimeout: 10000,
  return503OnClosing: true,
  forceCloseConnections: true,
  ajv: {
    customOptions: {
      removeAdditional: true,
      useDefaults: true,
      coerceTypes: true,
      allErrors: true,
      strict: false,
    },
    plugins: [],
  },
};

export default fastifySettings;
