import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { toPublicUser, toSelfUser } from "../lib/serializers";
import { USERNAME_REGEX, BIO_MAX_LENGTH } from "@messenger/shared";

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  username: z.string().trim().toLowerCase().regex(USERNAME_REGEX).optional(),
  bio: z.string().max(BIO_MAX_LENGTH).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  // Accent color preference stored server-side so it roams across devices.
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  // Public profile by id (used by call screen / signaling).
  app.get<{ Params: { id: string } }>(
    "/users/by-id/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      return { user: await toPublicUser(user) };
    },
  );

  // Public profile by username.
  app.get<{ Params: { username: string } }>(
    "/users/:username",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { username: req.params.username } });
      if (!user) return reply.code(404).send({ error: "not_found" });
      return { user: await toPublicUser(user) };
    },
  );

  // Update self.
  app.patch("/users/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const data = parsed.data;

    if (data.username) {
      const clash = await prisma.user.findFirst({
        where: { username: data.username, NOT: { id: req.user.sub } },
        select: { id: true },
      });
      if (clash) return reply.code(409).send({ error: "username_taken" });
    }

    const user = await prisma.user.update({ where: { id: req.user.sub }, data });
    return { user: await toSelfUser(user) };
  });

  // Username availability check. Public so the registration screen can use it;
  // when called with a valid token the user's own username counts as available.
  app.get<{ Querystring: { username?: string } }>(
    "/users/check-username",
    async (req) => {
      const q = (req.query.username ?? "").trim().toLowerCase().replace(/^@/, "");
      if (!USERNAME_REGEX.test(q)) return { available: false, reason: "invalid_format" };
      let selfId: string | null = null;
      try {
        await req.jwtVerify();
        if (req.user.type === "access") selfId = req.user.sub;
      } catch {}
      const exists = await prisma.user.findFirst({
        where: { username: q, ...(selfId ? { NOT: { id: selfId } } : {}) },
        select: { id: true },
      });
      return { available: !exists };
    },
  );

  // Live search by username / first / last.
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    "/users/search",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const q = (req.query.q ?? "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
      if (q.length === 0) return { results: [] };
      const clean = q.replace(/^@/, "");
      const users = await prisma.user.findMany({
        where: {
          AND: [
            { NOT: { id: req.user.sub } },
            {
              OR: [
                { username: { contains: clean, mode: "insensitive" } },
                { firstName: { contains: clean, mode: "insensitive" } },
                { lastName: { contains: clean, mode: "insensitive" } },
              ],
            },
          ],
        },
        take: limit,
        orderBy: { username: "asc" },
      });

      // Persist last search query. Skip if it just extends/repeats the previous
      // one — otherwise every debounce keystroke ("al", "ale", "alex") is stored.
      if (clean.length >= 2) {
        const last = await prisma.searchHistory.findFirst({
          where: { userId: req.user.sub },
          orderBy: { createdAt: "desc" },
          select: { id: true, query: true },
        });
        if (last && (clean.startsWith(last.query) || last.query.startsWith(clean))) {
          await prisma.searchHistory
            .update({ where: { id: last.id }, data: { query: clean, createdAt: new Date() } })
            .catch(() => {});
        } else {
          await prisma.searchHistory.create({ data: { userId: req.user.sub, query: clean } }).catch(() => {});
        }
      }

      return { results: await Promise.all(users.map(toPublicUser)) };
    },
  );

  app.get("/users/search-history", { preHandler: [app.authenticate] }, async (req) => {
    const rows = await prisma.searchHistory.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      take: 10,
      distinct: ["query"],
    });
    return { history: rows.map((r) => ({ query: r.query, at: r.createdAt.toISOString() })) };
  });

  app.delete("/users/search-history", { preHandler: [app.authenticate] }, async (req) => {
    await prisma.searchHistory.deleteMany({ where: { userId: req.user.sub } });
    return { ok: true };
  });
}
