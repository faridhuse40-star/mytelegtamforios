import nodemailer from "nodemailer";
import { env } from "./env";

export function isEmailConfigured(): boolean {
  return Boolean((env.RESEND_API_KEY && env.MAIL_FROM) || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM));
}

export async function sendVerificationEmail(to: string, code: string) {
  if (!isEmailConfigured()) throw new Error("email_not_configured");

  const subject = "Подтверждение аккаунта Messenger";
  const text = `Ваш код подтверждения: ${code}\n\nКод действует 15 минут.`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Подтверждение аккаунта Messenger</h2><p>Ваш код подтверждения:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Код действует 15 минут.</p></div>`;

  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] resend_send_failed", { status: res.status, body });
      throw new Error("email_send_failed");
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}
