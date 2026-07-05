import crypto from "crypto";
import { env } from "./env";
import { prisma } from "./prisma";

// We only use @fastify/jwt for verification plumbing; signing helpers live here
// so we can produce both access and refresh tokens from the same module.
import type { FastifyInstance } from "fastify";

export type AccessPayload = { sub: string; type: "access" };
export type RefreshPayload = { sub: string; type: "refresh"; jti: string };

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function issueTokens(app: FastifyInstance, userId: string) {
  const accessToken = app.jwt.sign(
    { sub: userId, type: "access" } satisfies AccessPayload,
    { expiresIn: env.JWT_ACCESS_TTL_SEC },
  );

  const jti = crypto.randomUUID();
  const refreshToken = app.jwt.sign(
    { sub: userId, type: "refresh", jti } satisfies RefreshPayload,
    { key: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_TTL_SEC },
  );

  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SEC * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(Date.now() + env.JWT_ACCESS_TTL_SEC * 1000).toISOString(),
    refreshExpiresAt: expiresAt.toISOString(),
  };
}

export async function revokeRefreshToken(raw: string) {
  const h = hashToken(raw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: h, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
