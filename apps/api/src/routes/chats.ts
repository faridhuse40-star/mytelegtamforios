import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { chatPeerId, toChatMessage, toPublicUser } from "../lib/serializers";

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function ensureChat(selfId: string, peerId: string) {
  if (selfId === peerId) throw new Error("cannot_chat_with_self");
  const [userAId, userBId] = orderPair(selfId, peerId);
  const chat = await prisma.chat.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: {},
    create: { userAId, userBId },
  });
  return chat;
}

export async function chatRoutes(app: FastifyInstance) {
  // List conversations.
  app.get("/chats", { preHandler: [app.authenticate] }, async (req) => {
    const selfId = req.user.sub;
    const chats = await prisma.chat.findMany({
      where: { OR: [{ userAId: selfId }, { userBId: selfId }] },
      include: {
        userA: true,
        userB: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        reads: { where: { userId: selfId } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const previews = await Promise.all(
      chats.map(async (c) => {
        const peerUser = c.userAId === selfId ? c.userB : c.userA;
        const pinned = c.userAId === selfId ? c.pinnedByA : c.pinnedByB;
        const lastMessage = c.messages[0] ?? null;
        const readRow = c.reads[0];
        // Cuid ids are not reliably ordered — compare by the read message's createdAt.
        const readUpTo = readRow?.upToMessageId
          ? await prisma.message.findUnique({
              where: { id: readRow.upToMessageId },
              select: { createdAt: true },
            })
          : null;
        const unreadCount = await prisma.message.count({
          where: {
            chatId: c.id,
            senderId: { not: selfId },
            deletedAt: null,
            ...(readUpTo ? { createdAt: { gt: readUpTo.createdAt } } : {}),
          },
        });
        return {
          id: c.id,
          peer: await toPublicUser(peerUser),
          lastMessage: lastMessage ? toChatMessage(lastMessage) : null,
          unreadCount,
          pinned,
          typing: false,
        };
      }),
    );
    // Pinned chats first, both groups keep recency order.
    previews.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return { chats: previews };
  });

  // Start or get chat with a user.
  app.post<{ Body: { username?: string; userId?: string } }>(
    "/chats/open",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = req.body ?? {};
      const peer = body.userId
        ? await prisma.user.findUnique({ where: { id: body.userId } })
        : body.username
          ? await prisma.user.findUnique({ where: { username: body.username } })
          : null;
      if (!peer) return reply.code(404).send({ error: "user_not_found" });
      const chat = await ensureChat(req.user.sub, peer.id);
      return { chatId: chat.id, peer: await toPublicUser(peer) };
    },
  );

  // Paginated message fetch (cursor by createdAt id).
  app.get<{ Params: { id: string }; Querystring: { cursor?: string; limit?: string; search?: string } }>(
    "/chats/:id/messages",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const selfId = req.user.sub;
      const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
      if (!chat || (chat.userAId !== selfId && chat.userBId !== selfId)) {
        return reply.code(404).send({ error: "chat_not_found" });
      }
      const limit = Math.min(Math.max(Number(req.query.limit ?? 40), 1), 100);

      const messages = await prisma.message.findMany({
        where: {
          chatId: chat.id,
          ...(req.query.cursor ? { createdAt: { lt: new Date(req.query.cursor) } } : {}),
          ...(req.query.search ? { text: { contains: req.query.search, mode: "insensitive" } } : {}),
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const peer = chat.userAId === selfId ? await prisma.user.findUnique({ where: { id: chat.userBId } }) : await prisma.user.findUnique({ where: { id: chat.userAId } });
      return {
        messages: messages.map((m) => toChatMessage(m)).reverse(),
        nextCursor: messages.length === limit ? messages[messages.length - 1]!.createdAt.toISOString() : null,
        peer: peer ? await toPublicUser(peer) : null,
      };
    },
  );

  // Mark as read.
  const readSchema = z.object({ upToMessageId: z.string().min(1) });
  app.post<{ Params: { id: string } }>(
    "/chats/:id/read",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = readSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
      const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
      if (!chat || (chat.userAId !== req.user.sub && chat.userBId !== req.user.sub)) {
        return reply.code(404).send({ error: "chat_not_found" });
      }
      await prisma.chatRead.upsert({
        where: { chatId_userId: { chatId: req.params.id, userId: req.user.sub } },
        update: { upToMessageId: parsed.data.upToMessageId },
        create: { chatId: req.params.id, userId: req.user.sub, upToMessageId: parsed.data.upToMessageId },
      });
      return { ok: true };
    },
  );

  // Pin / unpin.
  app.post<{ Params: { id: string }; Body: { pinned: boolean } }>(
    "/chats/:id/pin",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
      if (!chat || (chat.userAId !== req.user.sub && chat.userBId !== req.user.sub)) {
        return reply.code(404).send({ error: "chat_not_found" });
      }
      const field = chat.userAId === req.user.sub ? "pinnedByA" : "pinnedByB";
      await prisma.chat.update({ where: { id: chat.id }, data: { [field]: !!req.body.pinned } });
      return { ok: true };
    },
  );

  // Delete chat (for self — removes record entirely for simplicity).
  app.delete<{ Params: { id: string } }>(
    "/chats/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
      if (!chat || (chat.userAId !== req.user.sub && chat.userBId !== req.user.sub)) {
        return reply.code(404).send({ error: "chat_not_found" });
      }
      await prisma.chat.delete({ where: { id: chat.id } });
      return { ok: true };
    },
  );
}

// Exported helper for sockets.
export { chatPeerId };
