import type { User, Message, Chat, GiftInstance as PrismaGiftInstance, Gift as PrismaGift } from "@prisma/client";
import type {
  PublicUser,
  SelfUser,
  ChatMessage,
  MessageAttachment,
  MessageKind,
  MessageStatus,
  GiftInstance,
  GiftCatalogItem,
} from "@messenger/shared";
import { getPresence } from "./redis";
import { env } from "./env";

export async function toPublicUser(u: User): Promise<PublicUser> {
  const p = await getPresence(u.id);
  return {
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    lastSeenAt: (u.lastSeenAt ?? (p.lastSeenAt ? new Date(p.lastSeenAt) : null))?.toISOString?.() ?? p.lastSeenAt,
    isOnline: p.isOnline,
  };
}

export async function toSelfUser(u: User): Promise<SelfUser> {
  const pub = await toPublicUser(u);
  return {
    ...pub,
    email: u.email,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    starsBalance: u.starsBalance,
    accentColor: u.accentColor,
  };
}

// Builds the absolute URL that mobile can fetch from Fly directly.
function giftAssetUrl(slug: string, ext: "json" | "tgs"): string {
  const base = env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/static/gifts/${slug}.${ext}`;
}

export function toGiftCatalogItem(g: PrismaGift): GiftCatalogItem {
  return {
    slug: g.slug,
    name: g.name,
    stars: g.stars,
    supply: g.supply,
    remaining: g.supply == null ? null : Math.max(0, g.supply - g.sold),
    emoji: g.emoji,
    animationUrl: g.animated ? giftAssetUrl(g.slug, "json") : null,
    tgsUrl: g.animated ? giftAssetUrl(g.slug, "tgs") : null,
  };
}

export async function toGiftInstance(
  row: PrismaGiftInstance & { gift: PrismaGift; sender: User; receiver: User },
  viewerId?: string,
): Promise<GiftInstance> {
  // Anonymous gifts hide the sender from everyone except the sender themselves.
  const hideSender = row.anonymous && viewerId !== row.senderId;
  return {
    id: row.id,
    slug: row.giftSlug,
    name: row.gift.name,
    emoji: row.gift.emoji,
    animationUrl: row.gift.animated ? giftAssetUrl(row.giftSlug, "json") : null,
    stars: row.gift.stars,
    editionNumber: row.editionNumber,
    supply: row.gift.supply,
    sender: hideSender ? null : await toPublicUser(row.sender),
    receiver: await toPublicUser(row.receiver),
    anonymous: row.anonymous,
    message: row.message,
    hiddenOnProfile: row.hiddenOnProfile,
    convertedAt: row.convertedAt ? row.convertedAt.toISOString() : null,
    starsRefunded: row.starsRefunded,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toChatMessage(m: Message, status?: MessageStatus): ChatMessage {
  const computedStatus = status ?? (m.readAt ? "read" : m.deliveredAt ? "delivered" : "sent");
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    kind: (m.kind as MessageKind) ?? "text",
    text: m.text,
    attachments: (m.attachments as unknown as MessageAttachment[]) ?? [],
    replyToId: m.replyToId,
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    status: computedStatus,
  };
}

export function chatPeerId(chat: Chat, selfId: string): string {
  return chat.userAId === selfId ? chat.userBId : chat.userAId;
}
