import Redis from "ioredis";
import { env } from "./env";

// Redis is optional in dev; if it fails we fall back to in-memory presence.
let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (client) return client;
  try {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on("error", () => {
      /* swallow — we'll fall back gracefully */
    });
    void client.connect().catch(() => {
      client = null;
    });
    return client;
  } catch {
    return null;
  }
}

// In-memory presence fallback.
const memPresence = new Map<string, { isOnline: boolean; lastSeenAt: string | null }>();

export async function setPresence(userId: string, isOnline: boolean) {
  const payload = { isOnline, lastSeenAt: new Date().toISOString() };
  const r = getRedis();
  if (r && r.status === "ready") {
    try {
      await r.hset(`presence:${userId}`, payload as unknown as Record<string, string>);
      return payload;
    } catch {}
  }
  memPresence.set(userId, payload);
  return payload;
}

export async function getPresence(userId: string) {
  const r = getRedis();
  if (r && r.status === "ready") {
    try {
      const data = await r.hgetall(`presence:${userId}`);
      if (data && data.isOnline != null) {
        return {
          isOnline: data.isOnline === "true" || (data as any).isOnline === true,
          lastSeenAt: data.lastSeenAt ?? null,
        };
      }
    } catch {}
  }
  return memPresence.get(userId) ?? { isOnline: false, lastSeenAt: null };
}
