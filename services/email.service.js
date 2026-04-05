import nodemailer from "nodemailer";
import crypto from "crypto";
import { env } from "../config/env.js";

function hasSmtpConfig() {
  return Boolean(
    env.smtpHost &&
      env.smtpPort &&
      env.smtpUser &&
      env.smtpPass &&
      env.smtpFromEmail &&
      env.frontendUrl
  );
}

function createTransporter() {
  if (!hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: Number(env.smtpPort),
    secure: String(env.smtpSecure) === "true" || env.smtpSecure === true,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tempo limite do SMTP excedido")), ms)
    ),
  ]);
}

export function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function sendVerificationEmail({ to, name, token }) {
  const transporter = createTransporter();

  if (!transporter) {
    return {
      ok: false,
      skipped: true,
      message: "SMTP não configurado",
    };
  }

  const verifyUrl = `${String(env.frontendUrl).replace(/\/+$/, "")}/?verify=${token}`;
  const from = `"${env.smtpFromName || "Megan OS"}" <${env.smtpFromEmail}>`;
  const subject = "Confirme seu email - Megan OS";

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background:#0f172a; color:#e5e7eb; padding:32px;">
      <div style="max-width:600px; margin:0 auto; background:#111827; border:1px solid #1f2937; border-radius:16px; padding:32px;">
        <div style="font-size:12px; letter-spacing:1px; color:#93c5fd; margin-bottom:12px;">MEGAN OS</div>
        <h1 style="margin:0 0 16px; font-size:28px; color:#ffffff;">Confirme seu email</h1>
        <p style="font-size:16px; line-height:1.7; color:#d1d5db;">
          Olá, <strong>${name || "usuário"}</strong>.
        </p>
        <p style="font-size:16px; line-height:1.7; color:#d1d5db;">
          Para ativar sua conta na Megan OS, confirme seu email clicando no botão abaixo:
        </p>
        <div style="margin-top:24px;">
          <a href="${verifyUrl}" style="display:inline-block; padding:14px 22px; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700;">
            Confirmar email
          </a>
        </div>
        <p style="margin-top:24px; font-size:13px; color:#9ca3af;">
          Se o botão não abrir, use este link:
        </p>
        <p style="font-size:13px; color:#93c5fd; word-break:break-all;">
          ${verifyUrl}
        </p>
      </div>
    </div>
  `;

  const text = `Olá, ${name || "usuário"}.

Confirme seu email acessando:
${verifyUrl}`;

  const info = await withTimeout(
    transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    }),
    10000
  );

  return {
    ok: true,
    messageId: info.messageId,
  };
}