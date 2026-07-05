// Shared domain types between mobile app and API.

export type ID = string;

export interface PublicUser {
  id: ID;
  username: string;
  firstName: string;
  lastName: string;
  bio: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null; // ISO
  isOnline: boolean;
}

export interface SelfUser extends PublicUser {
  email: string;
  emailVerified: boolean;
  createdAt: string;
  starsBalance: number;
  accentColor: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string; // ISO
  refreshExpiresAt: string; // ISO
}

export interface LoginRequest {
  emailOrUsername: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  ok: true;
  email: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthResponse {
  user: SelfUser;
  tokens: AuthTokens;
}

export type MessageKind = "text" | "image" | "file" | "voice" | "gift" | "system";
export type MessageStatus = "sent" | "delivered" | "read";

export interface MessageAttachment {
  id: ID;
  url: string;
  mimeType: string;
  size: number;
  name: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface ChatMessage {
  id: ID;
  chatId: ID;
  senderId: ID;
  kind: MessageKind;
  text: string | null;
  attachments: MessageAttachment[];
  replyToId: ID | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  status: MessageStatus;
}

export interface ChatPreview {
  id: ID;
  peer: PublicUser;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  pinned: boolean;
  typing: boolean;
}

export type CallKind = "audio" | "video";
export type CallDirection = "incoming" | "outgoing";
export type CallStatus = "ringing" | "active" | "ended" | "missed" | "declined";

export interface CallRecord {
  id: ID;
  peer: PublicUser;
  kind: CallKind;
  direction: CallDirection;
  status: CallStatus;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
}

// ---- Socket events ----

export interface ServerToClientEvents {
  "message:new": (msg: ChatMessage) => void;
  "message:updated": (msg: ChatMessage) => void;
  "message:deleted": (payload: { chatId: ID; messageId: ID }) => void;
  "chat:typing": (payload: { chatId: ID; userId: ID; typing: boolean }) => void;
  "chat:read": (payload: { chatId: ID; userId: ID; upToMessageId: ID }) => void;
  "presence:update": (payload: { userId: ID; isOnline: boolean; lastSeenAt: string | null }) => void;
  "call:incoming": (payload: { callId: ID; from: PublicUser; kind: CallKind }) => void;
  "call:accepted": (payload: { callId: ID }) => void;
  "call:declined": (payload: { callId: ID }) => void;
  "call:ended": (payload: { callId: ID; durationSec: number }) => void;
  "call:signal": (payload: { callId: ID; from: ID; data: RTCSignalPayload }) => void;
  "call:upgrade-video": (payload: { callId: ID; from: ID; accept?: boolean }) => void;
}

export interface ClientToServerEvents {
  "message:send": (
    payload: {
      chatId: ID;
      text?: string | null;
      kind?: MessageKind;
      attachments?: MessageAttachment[];
      replyToId?: ID | null;
      clientNonce: string;
    },
    ack: (res: { ok: true; message: ChatMessage } | { ok: false; error: string }) => void,
  ) => void;
  "message:edit": (payload: { messageId: ID; text: string }) => void;
  "message:delete": (payload: { messageId: ID }) => void;
  "chat:typing": (payload: { chatId: ID; typing: boolean }) => void;
  "chat:read": (payload: { chatId: ID; upToMessageId: ID }) => void;
  "call:invite": (payload: { toUserId: ID; kind: CallKind }, ack: (res: { ok: true; callId: ID } | { ok: false; error: string }) => void) => void;
  "call:accept": (payload: { callId: ID }) => void;
  "call:decline": (payload: { callId: ID }) => void;
  "call:end": (payload: { callId: ID }) => void;
  "call:signal": (payload: { callId: ID; data: RTCSignalPayload }) => void;
  "call:upgrade-video": (payload: { callId: ID; accept?: boolean }) => void;
}

export type RTCSignalPayload =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: unknown };

// ---- Gifts ----

export interface GiftCatalogItem {
  slug: string;
  name: string;
  stars: number;
  supply: number | null;   // null = unlimited
  remaining: number | null;
  emoji: string | null;
  animationUrl: string | null; // absolute URL to Lottie JSON (null = emoji-only gift)
  tgsUrl: string | null;       // absolute URL to original .tgs (optional)
}

export interface GiftInstance {
  id: ID;
  slug: string;
  name: string;
  emoji: string | null;
  animationUrl: string | null;
  stars: number;                 // original price
  editionNumber: number;         // 1..supply (or 1..N for unlimited)
  supply: number | null;
  sender: PublicUser | null;     // null when sent anonymously (hidden from everyone but the sender)
  receiver: PublicUser;
  anonymous: boolean;
  message: string | null;
  hiddenOnProfile: boolean;
  convertedAt: string | null;
  starsRefunded: number;
  createdAt: string;
}

export interface SendGiftRequest {
  receiverUsername: string;
  giftSlug: string;
  message?: string | null;
  anonymous?: boolean;
}

export interface SendGiftResponse {
  instance: GiftInstance;
  newBalance: number;
}

// ---- Validation constants ----

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{4,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const BIO_MAX_LENGTH = 70;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const GIFT_MESSAGE_MAX_LENGTH = 255;
export const GIFT_CONVERT_RATIO = 0.8;
export const NEW_USER_STARS = 1000;
