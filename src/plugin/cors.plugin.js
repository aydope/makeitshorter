import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
import { Configs } from "../config/env.js";

async function corsPlugin(fastify, options) {
  const allowedOrigins = Configs.CORS_ORIGIN?.split(",") || [
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  await fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      if (Configs.NODE_ENV === "development") {
        return cb(null, true);
      }

      if (!origin || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      return cb(new Error(`Origin ${origin} Not Allowed By CORS!`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-Device-Id",
      "X-Request-Id",
      "X-Correlation-Id",
    ],
    exposedHeaders: [
      "Content-Length",
      "X-Total-Count",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-Request-Id",
    ],
    maxAge: 86400,
    preflight: true,
    optionsSuccessStatus: 204,
    strictPreflight: true,
    cacheControl: "public, max-age=86400",
  });

  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") {
      reply.header("Access-Control-Max-Age", "86400");
    }
  });

  fastify.log.info("CORS plugin registered");
}

export default fp(corsPlugin, { name: "corsPlugin" });
