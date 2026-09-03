import fp from "fastify-plugin";
import fastifyHelmet from "@fastify/helmet";
import { Configs } from "../config/env.js";

async function helmetPlugin(fastify, options) {
  const isDev = Configs.NODE_ENV === "development";

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-hashes'",
    "https://cdn.socket.io",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://cdn.tailwindcss.com",
  ];

  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
  }

  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc,
        scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com",
          "https://cdn.tailwindcss.com",
        ],
        fontSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com",
          "data:",
        ],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "https:",
          "https://cdn.socket.io",
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(isDev ? {} : { upgradeInsecureRequests: [] }),
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    originAgentCluster: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
    frameguard: { action: "deny" },
    hsts: isDev
      ? false
      : {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
  });

  fastify.log.info("Helmet plugin registered");
}

export default fp(helmetPlugin, { name: "helmet" });
