import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { issueTokens, hashToken, revokeRefreshToken } from "../lib/tokens";
import { toSelfUser } from "../lib/serializers";
import { isEmailConfigured, sendVerificationEmail } from "../lib/email";
import { USERNAME_REGEX, PASSWORD_MIN_LENGTH } from "@messenger/shared";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  username: z.string().trim().toLowerCase().regex(USERNAME_REGEX, "Username must be 4-32 chars: a-z, 0-9, _"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

function verificationCode(): string {
  return String(randomInt(100000, 1000000));
}

function verificationHash(email: string, code: string): string {
  return hashToken(`${email.toLowerCase()}:${code}:${env.JWT_ACCESS_SECRET}`);
}

function verificationExpiry(): Date {
  return new Date(Date.now() + 15 * 60 * 1000);
}

async function setAndSendVerificationCode(email: string) {
  if (!isEmailConfigured()) throw new Error("email_not_configured");
  const normalizedEmail = email.toLowerCase();
  const code = verificationCode();
  await prisma.user.update({
    where: { email: normalizedEmail },
    data: {
      emailVerificationCodeHash: verificationHash(normalizedEmail, code),
      emailVerificationExpiresAt: verificationExpiry(),
    },
  });
  await sendVerificationEmail(normalizedEmail, code);
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    const { firstName, lastName, username, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    if (!isEmailConfigured()) return reply.code(503).send({ error: "email_not_configured" });

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username }] },
      select: { id: true, email: true, username: true },
    });
    if (existing) {
      const field = existing.email === normalizedEmail ? "email" : "username";
      return reply.code(409).send({ error: "already_exists", field });
    }

    const code = verificationCode();
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        username,
        email: normalizedEmail,
        passwordHash,
        emailVerificationCodeHash: verificationHash(normalizedEmail, code),
        emailVerificationExpiresAt: verificationExpiry(),
      },
    });

    try {
      await sendVerificationEmail(normalizedEmail, code);
    } catch {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      return reply.code(502).send({ error: "email_send_failed" });
    }

    return { ok: true, email: normalizedEmail };
  });

  app.post("/auth/verify-email", async (req, reply) => {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return reply.code(404).send({ error: "not_found" });
    if (user.emailVerified) {
      const tokens = await issueTokens(app, user.id);
      return { user: await toSelfUser(user), tokens };
    }
    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      return reply.code(400).send({ error: "code_expired" });
    }
    if (user.emailVerificationCodeHash !== verificationHash(email, parsed.data.code)) {
      return reply.code(400).send({ error: "invalid_code" });
    }
    const verified = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationCodeHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    const tokens = await issueTokens(app, verified.id);
    return { user: await toSelfUser(verified), tokens };
  });

  app.post("/auth/resend-verification", async (req, reply) => {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) return { ok: true };
    try {
      await setAndSendVerificationCode(email);
      return { ok: true };
    } catch (e: any) {
      if (e?.message === "email_not_configured") return reply.code(503).send({ error: "email_not_configured" });
      return reply.code(502).send({ error: "email_send_failed" });
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { emailOrUsername, password } = parsed.data;

    // Usernames are stored lowercase; accept "@name", "Name" etc. on login.
    const identifier = emailOrUsername.trim().toLowerCase().replace(/^@/, "");
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });
    if (!user) return reply.code(401).send({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "invalid_credentials" });
    if (!user.emailVerified) {
      await setAndSendVerificationCode(user.email).catch(() => {});
      return reply.code(403).send({ error: "email_not_verified", email: user.email });
    }

    const tokens = await issueTokens(app, user.id);
    return { user: await toSelfUser(user), tokens };
  });

  app.post("/auth/refresh", async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { refreshToken } = parsed.data;

    try {
      const decoded = app.jwt.verify<{ sub: string; type: string; jti?: string }>(refreshToken, {
        key: env.JWT_REFRESH_SECRET,
      });
      if (decoded.type !== "refresh") throw new Error("wrong_type");

      const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
      if (!record || record.revokedAt || record.expiresAt < new Date()) {
        return reply.code(401).send({ error: "invalid_refresh" });
      }

      await revokeRefreshToken(refreshToken); // rotate
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) return reply.code(401).send({ error: "invalid_refresh" });

      const tokens = await issueTokens(app, user.id);
      return { user: await toSelfUser(user), tokens };
    } catch {
      return reply.code(401).send({ error: "invalid_refresh" });
    }
  });

  app.post("/auth/logout", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) await revokeRefreshToken(body.refreshToken);
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { user: await toSelfUser(user) };
  });
}
