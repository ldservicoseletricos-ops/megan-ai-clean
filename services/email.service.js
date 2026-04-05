import crypto from "crypto";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function getAppBaseUrl() {
  const frontendUrl =
    normalizeBaseUrl(env.frontendUrl) ||
    normalizeBaseUrl(process.env.FRONTEND_URL);

  if (frontendUrl) {
    return frontendUrl;
  }

  return "http://localhost:5173";
}

function getVerificationUrl(token) {
  const baseUrl = getAppBaseUrl();
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

function hasSmtpConfig() {
  const host = String(env.smtpHost || process.env.SMTP_HOST || "").trim();
  const port = String(env.smtpPort || process.env.SMTP_PORT || "").trim();
  const user = String(env.smtpUser || process.env.SMTP_USER || "").trim();
  const pass = String(env.smtpPass || process.env.SMTP_PASS || "").trim();

  return Boolean(host && port && user && pass);
}

function getTransportConfig() {
  const host = String(env.smtpHost || process.env.SMTP_HOST || "").trim();
  const port = Number(env.smtpPort || process.env.SMTP_PORT || 587);
  const user = String(env.smtpUser || process.env.SMTP_USER || "").trim();
  const pass = String(env.smtpPass || process.env.SMTP_PASS || "").trim();
  const secure =
    String(env.smtpSecure || process.env.SMTP_SECURE || "").trim() === "true" ||
    port === 465;

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  };
}

function getFromEmail() {
  return (
    String(env.smtpFrom || process.env.SMTP_FROM || "").trim() ||
    String(env.smtpUser || process.env.SMTP_USER || "").trim() ||
    "no-reply@megan.local"
  );
}

function buildVerificationEmailHtml({ name, verificationUrl, token }) {
  const safeName = String(name || "Usuário").trim() || "Usuário";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif; background:#f5f7fb; padding:32px; color:#111827;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:18px; padding:32px; box-shadow:0 10px 30px rgba(0,0,0,0.08);">
        <h1 style="margin:0 0 16px; font-size:24px;">Confirmar seu email</h1>
        <p style="font-size:16px; line-height:1.6; margin:0 0 16px;">
          Olá, <strong>${safeName}</strong>.
        </p>
        <p style="font-size:16px; line-height:1.6; margin:0 0 24px;">
          Obrigado por criar sua conta na <strong>Megan OS</strong>. Para ativar seu acesso, confirme seu email clicando no botão abaixo:
        </p>

        <div style="margin:24px 0; text-align:center;">
          <a
            href="${verificationUrl}"
            style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; padding:14px 22px; border-radius:12px; font-weight:700;"
          >
            Confirmar email
          </a>
        </div>

        <p style="font-size:14px; color:#4b5563; line-height:1.6; margin:24px 0 8px;">
          Se o botão não funcionar, copie e cole este link no navegador:
        </p>
        <p style="font-size:14px; word-break:break-word; color:#2563eb; margin:0 0 20px;">
          ${verificationUrl}
        </p>

        <p style="font-size:13px; color:#6b7280; line-height:1.6; margin:0;">
          Token de verificação: <strong>${token}</strong>
        </p>

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />

        <p style="font-size:12px; color:#6b7280; line-height:1.6; margin:0;">
          Se você não criou esta conta, ignore este email.
        </p>
      </div>
    </div>
  `;
}

function buildVerificationEmailText({ name, verificationUrl, token }) {
  const safeName = String(name || "Usuário").trim() || "Usuário";

  return [
    `Olá, ${safeName}.`,
    "",
    "Obrigado por criar sua conta na Megan OS.",
    "Para ativar seu acesso, confirme seu email no link abaixo:",
    "",
    verificationUrl,
    "",
    `Token de verificação: ${token}`,
    "",
    "Se você não criou esta conta, ignore este email.",
  ].join("\n");
}

let transporterInstance = null;

export function generateVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function getEmailTransporter() {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (transporterInstance) {
    return transporterInstance;
  }

  const transporter = nodemailer.createTransport(getTransportConfig());
  await transporter.verify();

  transporterInstance = transporter;
  return transporterInstance;
}

export async function sendVerificationEmail({ to, name, token }) {
  const recipient = String(to || "").trim().toLowerCase();
  const verificationToken = String(token || "").trim();

  if (!recipient) {
    throw new Error("Destinatário de email não informado");
  }

  if (!verificationToken) {
    throw new Error("Token de verificação não informado");
  }

  const verificationUrl = getVerificationUrl(verificationToken);

  if (!hasSmtpConfig()) {
    console.warn("[EMAIL] SMTP não configurado. Envio ignorado.");

    return {
      ok: true,
      skipped: true,
      message: "SMTP não configurado",
      verifyUrl: verificationUrl,
      verifyToken: verificationToken,
    };
  }

  const transporter = await getEmailTransporter();

  const mailOptions = {
    from: getFromEmail(),
    to: recipient,
    subject: "Confirme seu email - Megan OS",
    text: buildVerificationEmailText({
      name,
      verificationUrl,
      token: verificationToken,
    }),
    html: buildVerificationEmailHtml({
      name,
      verificationUrl,
      token: verificationToken,
    }),
  };

  const info = await transporter.sendMail(mailOptions);

  return {
    ok: true,
    skipped: false,
    messageId: info.messageId || null,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response || null,
    verifyUrl: verificationUrl,
  };
}

export default {
  generateVerificationToken,
  getEmailTransporter,
  sendVerificationEmail,
};