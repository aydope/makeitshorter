import { AuthController } from "../controllers/auth.controller.js";
import { authenticate, nextOnAuth } from "../middleware/auth.middleware.js";

export const authRoutes = async (fastify) => {
  fastify.addHook("preHandler", authenticate);

  fastify.post("/login", AuthController.login);
  fastify.post("/register", AuthController.register);
  fastify.post("/refresh-token", AuthController.refreshToken);
  fastify.post("/logout", AuthController.logout);

  fastify.get(
    "/profile",
    { preHandler: [nextOnAuth] },
    AuthController.getProfile,
  );

  fastify.put(
    "/profile",
    { preHandler: [nextOnAuth] },
    AuthController.updateProfile,
  );

  fastify.put(
    "/change-password",
    { preHandler: [nextOnAuth] },
    AuthController.changePassword,
  );
};
