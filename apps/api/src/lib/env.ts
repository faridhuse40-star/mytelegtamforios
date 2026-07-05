import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4000),
  HOST: process.env.HOST ?? "0.0.0.0",
  DATABASE_URL: required("DATABASE_URL", "postgresql://messenger:messenger@localhost:5432/messenger?schema=public"),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET", "dev_access_secret_change_me"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET", "dev_refresh_secret_change_me"),
  JWT_ACCESS_TTL_SEC: Number(process.env.JWT_ACCESS_TTL_SEC ?? 900),
  JWT_REFRESH_TTL_SEC: Number(process.env.JWT_REFRESH_TTL_SEC ?? 604800),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
  // TURN credentials are optional — absence of any of these MUST NOT break startup.
  // When TURN_URL is undefined/empty, /calls/ice-config returns only the STUN server.
  TURN_URL: process.env.TURN_URL || undefined,
  TURN_USERNAME: process.env.TURN_USERNAME || undefined,
  TURN_PASSWORD: process.env.TURN_PASSWORD || undefined,
  // Absolute base URL the frontend uses (used to build gift asset URLs etc.).
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "https://messenger-api-far.fly.dev",
  SMTP_HOST: process.env.SMTP_HOST || undefined,
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || undefined,
  SMTP_PASS: process.env.SMTP_PASS || undefined,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  MAIL_FROM: process.env.MAIL_FROM || process.env.SMTP_USER || undefined,
};
