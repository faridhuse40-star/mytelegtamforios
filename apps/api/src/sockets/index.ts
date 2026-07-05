import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@messenger/shared";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { setPresence } from "../lib/redis";
import { toChatMessage, toPublicUser } from "../lib/serializers";
import { ensureChat } from "../routes/chats";

type IO = Server<ClientToServerEvents, ServerToClientEvents, {}, { userId: string }>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, {}, { userId: string }>;

// Map: userId -> set of socket ids.
const userSockets = new Map<string, Set<string>>();
// Active calls in memory: callId -> { fromUserId, toUserId, kind, startedAt }
const activeCalls = new Map<string, { fromUserId: string; toUserId: string; kind: "audio" | "video"; startedAt: Date; acceptedAt?: Date }>();

function addSocket(userId: string, socketId: string) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(socketId);
}
function removeSocket(userId: string, socketId: string) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}
function emitToUser(io: IO, userId: string, event: keyof ServerToClientEvents, payload: any) {
  const ids = userSockets.get(userId);
  if (!ids) return;
  for (const sid of ids) io.to(sid).emit(event as any, payload);
}

// Set once in createSocketServer so HTTP routes (e.g. gifts) can push
// realtime events without owning a socket reference.
let ioRef: IO | null = null;

export function pushToUser(userId: string, event: keyof ServerToClientEvents, payload: any) {
  if (!ioRef) return;
  emitToUser(ioRef, userId, event, payload);
}

export function isUserOnline(userId: string): boolean {
  return userSockets.has(userId);
}

/**
 * Ends an active call and notifies both participants.
 *
 * Computes `durationSec` and final `status` per Requirements 11.6, 11.10, 11.11:
 *   - `startedAt' = acceptedAt ?? startedAt`
 *   - `durationSec = max(0, floor((endedAt - startedAt') / 1000))`
 *   - `status` resolution:
 *       - `reason === "declined"` → `"declined"` (explicit decline path)
 *       - otherwise: `acceptedAt` present → `"ended"`, else → `"missed"`
 *
 * Side effects:
 *   - Updates the Prisma `Call` record with `{ endedAt, status, durationSec }`.
 *   - Removes the entry from `activeCalls`.
 *   - Emits `call:ended { callId, durationSec }` to all sockets of both participants.
 *
 * No-op when `callId` is not present in `activeCalls`.
 */
async function endCall(io: IO, callId: string, reason: "ended" | "declined" = "ended"): Promise<void> {
  const active = activeCalls.get(callId);
  if (!active) return;
  const endedAt = new Date();
  const startedAt = active.acceptedAt ?? active.startedAt;
  const durationSec = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
  const status = reason === "declined" ? "declined" : active.acceptedAt ? "ended" : "missed";
  activeCalls.delete(callId);
  await prisma.call
    .update({ where: { id: callId }, data: { status, endedAt, durationSec } })
    .catch(() => {});
  emitToUser(io, active.fromUserId, "call:ended", { callId, durationSec });
  emitToUser(io, active.toUserId, "call:ended", { callId, durationSec });
}

export function createSocketServer(app: FastifyInstance) {
  const io: IO = new Server(app.server, {
    cors: { origin: env.CORS_ORIGIN, credentials: false },
    transports: ["websocket"],
  });
  ioRef = io;

  // Authenticate every connection using JWT from auth handshake.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return next(new Error("no_token"));
      const decoded = app.jwt.verify<{ sub: string; type: string }>(token);
      if (decoded.type !== "access") return next(new Error("wrong_type"));
      socket.data.userId = decoded.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket: Sock) => {
    const userId = socket.data.userId;
    addSocket(userId, socket.id);
    const presence = await setPresence(userId, true);
    io.emit("presence:update", { userId, isOnline: true, lastSeenAt: presence.lastSeenAt });

    // -- Messaging --
    socket.on("message:send", async (payload, ack) => {
      try {
        const chat = await prisma.chat.findUnique({ where: { id: payload.chatId } });
        if (!chat || (chat.userAId !== userId && chat.userBId !== userId)) {
          return ack({ ok: false, error: "chat_not_found" });
        }
        const peerId = chat.userAId === userId ? chat.userBId : chat.userAId;
        if (payload.clientNonce) {
          const existing = await prisma.message.findUnique({
            where: { senderId_clientNonce: { senderId: userId, clientNonce: payload.clientNonce } },
          });
          if (existing) return ack({ ok: true, message: toChatMessage(existing) });
        }
        const message = await prisma.message.create({
          data: {
            chatId: chat.id,
            senderId: userId,
            kind: payload.kind ?? "text",
            text: payload.text ?? null,
            attachments: payload.attachments ? (payload.attachments as any) : undefined,
            clientNonce: payload.clientNonce,
            deliveredAt: userSockets.has(peerId) ? new Date() : null,
            replyToId: payload.replyToId ?? null,
          },
        });
        await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
        const serialized = toChatMessage(message);
        ack({ ok: true, message: serialized });
        emitToUser(io, peerId, "message:new", serialized);
      } catch (e) {
        ack({ ok: false, error: "send_failed" });
      }
    });

    socket.on("message:edit", async ({ messageId, text }) => {
      const clean = typeof text === "string" ? text.trim().slice(0, 4096) : "";
      if (!clean) return;
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg || msg.senderId !== userId || msg.deletedAt) return;
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { text: clean, editedAt: new Date() },
      });
      // Keep the real delivery status — forcing "delivered" would visually
      // "unread" an already read message on the sender's side.
      const serialized = toChatMessage(updated);
      const chat = await prisma.chat.findUnique({ where: { id: msg.chatId } });
      if (!chat) return;
      emitToUser(io, chat.userAId, "message:updated", serialized);
      emitToUser(io, chat.userBId, "message:updated", serialized);
    });

    socket.on("message:delete", async ({ messageId }) => {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg || msg.senderId !== userId) return;
      await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), text: null } });
      const chat = await prisma.chat.findUnique({ where: { id: msg.chatId } });
      if (!chat) return;
      const payload = { chatId: chat.id, messageId };
      emitToUser(io, chat.userAId, "message:deleted", payload);
      emitToUser(io, chat.userBId, "message:deleted", payload);
    });

    socket.on("chat:typing", async ({ chatId, typing }) => {
      const chat = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!chat) return;
      if (chat.userAId !== userId && chat.userBId !== userId) return;
      const peerId = chat.userAId === userId ? chat.userBId : chat.userAId;
      emitToUser(io, peerId, "chat:typing", { chatId, userId, typing });
    });

    socket.on("chat:read", async ({ chatId, upToMessageId }) => {
      const chat = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!chat || (chat.userAId !== userId && chat.userBId !== userId)) return;
      await prisma.chatRead.upsert({
        where: { chatId_userId: { chatId, userId } },
        update: { upToMessageId },
        create: { chatId, userId, upToMessageId },
      });
      const peerId = chat.userAId === userId ? chat.userBId : chat.userAId;
      const readMessage = await prisma.message.findUnique({ where: { id: upToMessageId } });
      if (readMessage) {
        await prisma.message.updateMany({
          where: {
            chatId,
            senderId: peerId,
            createdAt: { lte: readMessage.createdAt },
            readAt: null,
          },
          data: { readAt: new Date(), deliveredAt: new Date() },
        });
        const updated = await prisma.message.findMany({
          where: { chatId, senderId: peerId, createdAt: { lte: readMessage.createdAt } },
          orderBy: { createdAt: "desc" },
          take: 40,
        });
        updated.forEach((m) => emitToUser(io, peerId, "message:updated", toChatMessage(m)));
      }
      emitToUser(io, peerId, "chat:read", { chatId, userId, upToMessageId });
    });

    // -- Calls --
    socket.on("call:invite", async ({ toUserId, kind }, ack) => {
      try {
        if (toUserId === userId) return ack({ ok: false, error: "cannot_call_self" });
        const peer = await prisma.user.findUnique({ where: { id: toUserId } });
        if (!peer) return ack({ ok: false, error: "peer_not_found" });
        await ensureChat(userId, toUserId); // make sure chat exists
        const call = await prisma.call.create({
          data: { fromUserId: userId, toUserId, kind, status: "ringing" },
        });
        activeCalls.set(call.id, { fromUserId: userId, toUserId, kind, startedAt: call.startedAt });
        ack({ ok: true, callId: call.id });

        const me = await prisma.user.findUnique({ where: { id: userId } });
        if (me) {
          emitToUser(io, toUserId, "call:incoming", { callId: call.id, from: await toPublicUser(me), kind });
        }
      } catch {
        ack({ ok: false, error: "invite_failed" });
      }
    });

    socket.on("call:accept", async ({ callId }) => {
      const active = activeCalls.get(callId);
      if (!active || active.toUserId !== userId) return;
      active.acceptedAt = new Date();
      await prisma.call.update({ where: { id: callId }, data: { status: "active", acceptedAt: active.acceptedAt } });
      emitToUser(io, active.fromUserId, "call:accepted", { callId });
    });

    socket.on("call:decline", async ({ callId }) => {
      const active = activeCalls.get(callId);
      if (!active) return;
      if (active.toUserId !== userId && active.fromUserId !== userId) return;
      await prisma.call.update({ where: { id: callId }, data: { status: "declined", endedAt: new Date() } });
      activeCalls.delete(callId);
      emitToUser(io, active.fromUserId, "call:declined", { callId });
      emitToUser(io, active.toUserId, "call:declined", { callId });
    });

    socket.on("call:end", async ({ callId }) => {
      const active = activeCalls.get(callId);
      if (!active) return;
      if (active.toUserId !== userId && active.fromUserId !== userId) return;
      await endCall(io, callId, "ended");
    });

    socket.on("call:signal", ({ callId, data }) => {
      const active = activeCalls.get(callId);
      if (!active) return;
      if (active.toUserId !== userId && active.fromUserId !== userId) return;
      const peerId = active.fromUserId === userId ? active.toUserId : active.fromUserId;
      emitToUser(io, peerId, "call:signal", { callId, from: userId, data });
    });

    socket.on("call:upgrade-video", ({ callId, accept }: { callId: string; accept?: boolean }) => {
      const active = activeCalls.get(callId);
      if (!active) return;
      if (active.toUserId !== userId && active.fromUserId !== userId) return;
      const peerId = active.fromUserId === userId ? active.toUserId : active.fromUserId;
      if (accept === true) active.kind = "video";
      emitToUser(io, peerId, "call:upgrade-video", { callId, from: userId, accept });
    });

    socket.on("disconnect", async () => {
      removeSocket(userId, socket.id);
      if (!userSockets.has(userId)) {
        const presence = await setPresence(userId, false);
        await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
        io.emit("presence:update", { userId, isOnline: false, lastSeenAt: presence.lastSeenAt });

        // End any active calls this user was part of.
        for (const [callId, active] of activeCalls) {
          if (active.fromUserId === userId || active.toUserId === userId) {
            await endCall(io, callId, "ended");
          }
        }
      }
    });
  });

  return io;
}
