import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { toChatMessage, toGiftCatalogItem, toGiftInstance } from "../lib/serializers";
import { ensureChat } from "./chats";
import { isUserOnline, pushToUser } from "../sockets";
import { GIFT_MESSAGE_MAX_LENGTH, GIFT_CONVERT_RATIO } from "@messenger/shared";

const sendSchema = z.object({
  receiverUsername: z.string().min(1).max(32),
  giftSlug: z.string().min(1).max(64),
  message: z.string().max(GIFT_MESSAGE_MAX_LENGTH).nullable().optional(),
  anonymous: z.boolean().optional(),
});

export async function giftRoutes(app: FastifyInstance) {
  // Public catalog (any authenticated user can browse).
  app.get("/gifts/catalog", { preHandler: [app.authenticate] }, async () => {
    const rows = await prisma.gift.findMany({ orderBy: [{ stars: "asc" }, { slug: "asc" }] });
    return { gifts: rows.map(toGiftCatalogItem) };
  });

  // Self stars balance.
  app.get("/gifts/my-balance", { preHandler: [app.authenticate] }, async (req) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { starsBalance: true },
    });
    return { balance: u?.starsBalance ?? 0 };
  });

  // Gifts received by a given user (only visible ones).
  app.get<{ Params: { username: string } }>(
    "/users/:username/gifts",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const target = await prisma.user.findUnique({
        where: { username: req.params.username },
        select: { id: true },
      });
      if (!target) return reply.code(404).send({ error: "not_found" });

      const isSelf = target.id === req.user.sub;
      const rows = await prisma.giftInstance.findMany({
        where: {
          receiverId: target.id,
          convertedAt: null,
          ...(isSelf ? {} : { hiddenOnProfile: false }),
        },
        include: { gift: true, sender: true, receiver: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { gifts: await Promise.all(rows.map((r) => toGiftInstance(r, req.user.sub))) };
    },
  );

  // Send a gift. Atomic: deduct stars, increment Gift.sold, insert GiftInstance.
  app.post("/gifts/send", { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { receiverUsername, giftSlug, message, anonymous } = parsed.data;

    const receiver = await prisma.user.findUnique({ where: { username: receiverUsername } });
    if (!receiver) return reply.code(404).send({ error: "receiver_not_found" });
    if (receiver.id === req.user.sub) return reply.code(400).send({ error: "cannot_gift_self" });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const gift = await tx.gift.findUnique({ where: { slug: giftSlug } });
        if (!gift) throw new Error("gift_not_found");
        if (gift.supply != null && gift.sold >= gift.supply) throw new Error("sold_out");

        const sender = await tx.user.findUnique({
          where: { id: req.user.sub },
          select: { id: true, starsBalance: true },
        });
        if (!sender) throw new Error("sender_not_found");
        if (sender.starsBalance < gift.stars) throw new Error("insufficient_funds");

        const nextEdition = gift.sold + 1;
        const updatedGift = await tx.gift.update({
          where: { slug: giftSlug },
          data: { sold: nextEdition },
        });

        await tx.user.update({
          where: { id: sender.id },
          data: { starsBalance: { decrement: gift.stars } },
        });

        const instance = await tx.giftInstance.create({
          data: {
            giftSlug,
            senderId: sender.id,
            receiverId: receiver.id,
            editionNumber: nextEdition,
            message: message ?? null,
            anonymous: anonymous ?? false,
          },
          include: { gift: true, sender: true, receiver: true },
        });

        const senderFresh = await tx.user.findUniqueOrThrow({
          where: { id: sender.id },
          select: { starsBalance: true },
        });

        return { instance, senderBalance: senderFresh.starsBalance, gift: updatedGift };
      });

      // Telegram-style: the gift also lands in the 1:1 chat as a message.
      // Gift data rides in the attachment slot: name=emoji, size=stars price,
      // width=editionNumber, height=supply (see the mobile gift bubble renderer).
      try {
        const chat = await ensureChat(req.user.sub, receiver.id);
        const chatMessage = await prisma.message.create({
          data: {
            chatId: chat.id,
            senderId: req.user.sub,
            kind: "gift",
            text: result.instance.gift.name,
            attachments: [
              {
                id: result.instance.id,
                url: "",
                mimeType: "application/x-gift",
                size: result.instance.gift.stars,
                name: result.instance.gift.emoji ?? "🎁",
                width: result.instance.editionNumber,
                height: result.instance.gift.supply ?? 0,
              },
            ],
            deliveredAt: isUserOnline(receiver.id) ? new Date() : null,
          },
        });
        await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
        const serialized = toChatMessage(chatMessage);
        pushToUser(receiver.id, "message:new", serialized);
        pushToUser(req.user.sub, "message:new", serialized);
      } catch (e) {
        app.log.error(e, "gift chat message failed");
      }

      return {
        instance: await toGiftInstance(result.instance, req.user.sub),
        newBalance: result.senderBalance,
      };
    } catch (e: any) {
      const code = e?.message;
      const statusByCode: Record<string, number> = {
        gift_not_found: 404,
        sender_not_found: 404,
        sold_out: 409,
        insufficient_funds: 402,
      };
      if (statusByCode[code]) return reply.code(statusByCode[code]).send({ error: code });
      app.log.error(e, "gift send failed");
      return reply.code(500).send({ error: "internal" });
    }
  });

  // Toggle hide-on-profile for a gift you own (i.e. you are the receiver).
  app.post<{ Params: { id: string }; Body: { hidden: boolean } }>(
    "/gifts/instances/:id/hide",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const inst = await prisma.giftInstance.findUnique({ where: { id: req.params.id } });
      if (!inst || inst.receiverId !== req.user.sub)
        return reply.code(404).send({ error: "not_found" });
      const updated = await prisma.giftInstance.update({
        where: { id: inst.id },
        data: { hiddenOnProfile: Boolean(req.body?.hidden) },
        include: { gift: true, sender: true, receiver: true },
      });
      return { instance: await toGiftInstance(updated, req.user.sub) };
    },
  );

  // Convert a received gift to Stars (80% refund). Destroys the instance.
  app.post<{ Params: { id: string } }>(
    "/gifts/instances/:id/convert",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        const { balance, refund } = await prisma.$transaction(async (tx) => {
          const inst = await tx.giftInstance.findUnique({
            where: { id: req.params.id },
            include: { gift: true },
          });
          if (!inst || inst.receiverId !== req.user.sub) throw new Error("not_found");
          if (inst.convertedAt) throw new Error("already_converted");

          const refund = Math.round(inst.gift.stars * GIFT_CONVERT_RATIO);
          await tx.giftInstance.update({
            where: { id: inst.id },
            data: { convertedAt: new Date(), starsRefunded: refund, hiddenOnProfile: true },
          });
          const user = await tx.user.update({
            where: { id: req.user.sub },
            data: { starsBalance: { increment: refund } },
            select: { starsBalance: true },
          });
          return { balance: user.starsBalance, refund };
        });
        return { newBalance: balance, refunded: refund };
      } catch (e: any) {
        const code = e?.message;
        if (code === "not_found") return reply.code(404).send({ error: "not_found" });
        if (code === "already_converted") return reply.code(409).send({ error: "already_converted" });
        app.log.error(e, "gift convert failed");
        return reply.code(500).send({ error: "internal" });
      }
    },
  );
}
