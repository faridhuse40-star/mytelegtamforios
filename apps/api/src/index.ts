import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { env } from "./lib/env";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { chatRoutes } from "./routes/chats";
import { callRoutes } from "./routes/calls";
import { giftRoutes } from "./routes/gifts";
import { uploadRoutes } from "./routes/uploads";
import { loadGiftsCatalog } from "./lib/gifts-seeder";
import { createSocketServer } from "./sockets";

async function main() {
  const app = Fastify({ logger: env.NODE_ENV === "development" });

  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(multipart);
  await app.register(jwt, {
    secret: { private: env.JWT_ACCESS_SECRET, public: env.JWT_ACCESS_SECRET },
  });

  app.decorate("authenticate", async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
      if (req.user.type !== "access") throw new Error("wrong_type");
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/health", async () => ({ ok: true, uptime: process.uptime() }));

  // Prepare gift catalog (decompress .tgs, upsert DB rows) and expose assets at /static/gifts/*.
  const giftsDir = path.resolve(process.cwd(), "gifts");
  const giftsCacheDir = path.resolve(process.cwd(), ".cache", "gifts");
  await loadGiftsCatalog(giftsDir, giftsCacheDir).catch((e) => {
    app.log.error(e, "gifts catalog failed to load");
  });
  await app.register(fastifyStatic, {
    root: giftsCacheDir,
    prefix: "/static/gifts/",
    decorateReply: false,
    // Long cache since filenames are slug-based and immutable per release.
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  });

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(chatRoutes);
  await app.register(callRoutes);
  await app.register(giftRoutes);
  await app.register(uploadRoutes);

  // Start HTTP first, then attach socket.io to the same server.
  await app.listen({ port: env.PORT, host: env.HOST });
  createSocketServer(app);
  app.log.info(`api listening on http://${env.HOST}:${env.PORT}`);
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
