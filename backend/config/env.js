import dotenv from "dotenv";

dotenv.config();

function readEnv(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function readNumber(name, fallback) {
  const raw = readEnv(name, "");
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name, fallback = false) {
  const raw = readEnv(name, "");
  if (!raw) return fallback;

  const normalized = raw.toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return fallback;
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function maskSecret(value) {
  const raw = String(value || "").trim();

  if (!raw) return "MISSING";
  if (raw.length <= 8) return "********";

  return `${raw.slice(0, 4)}********${raw.slice(-4)}`;
}

export const env = {
  nodeEnv: readEnv("NODE_ENV", "development"),
  port: readNumber("PORT", 10000),

  frontendUrl: normalizeUrl(readEnv("FRONTEND_URL", "http://localhost:5173")),
  backendUrl: normalizeUrl(readEnv("BACKEND_URL", "")),

  databaseUrl: readEnv("DATABASE_URL", ""),

  jwtSecret: readEnv("JWT_SECRET", ""),
  jwtExpiresIn: readEnv("JWT_EXPIRES_IN", "7d"),

  googleClientId: readEnv("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: readEnv("GOOGLE_CLIENT_SECRET", ""),
  googleCallbackUrl: normalizeUrl(readEnv("GOOGLE_CALLBACK_URL", "")),

  geminiApiKey: readEnv("GEMINI_API_KEY", ""),
  geminiModel: readEnv("GEMINI_MODEL", "gemini-2.5-flash"),

  stripeSecretKey: readEnv("STRIPE_SECRET_KEY", ""),
  stripeWebhookSecret: readEnv("STRIPE_WEBHOOK_SECRET", ""),
  stripePriceIdPro: readEnv("STRIPE_PRICE_ID_PRO", ""),
  stripePriceIdEnterprise: readEnv("STRIPE_PRICE_ID_ENTERPRISE", ""),

  smtpHost: readEnv("SMTP_HOST", ""),
  smtpPort: readNumber("SMTP_PORT", 587),
  smtpUser: readEnv("SMTP_USER", ""),
  smtpPass: readEnv("SMTP_PASS", ""),
  smtpFrom: readEnv("SMTP_FROM", ""),
  smtpSecure: readBoolean("SMTP_SECURE", false),

  appName: readEnv("APP_NAME", "Megan OS"),
  appBasePlan: readEnv("APP_BASE_PLAN", "free"),
};

export function validateEnv() {
  const warnings = [];
  const errors = [];

  if (!env.jwtSecret) {
    errors.push("JWT_SECRET não configurado");
  }

  if (!env.databaseUrl) {
    warnings.push("DATABASE_URL não configurado");
  }

  if (!env.frontendUrl) {
    warnings.push("FRONTEND_URL não configurado");
  }

  if (env.googleClientId && !env.googleClientSecret) {
    warnings.push("GOOGLE_CLIENT_SECRET não configurado");
  }

  if (env.googleClientSecret && !env.googleClientId) {
    warnings.push("GOOGLE_CLIENT_ID não configurado");
  }

  if (env.smtpHost || env.smtpUser || env.smtpPass) {
    if (!env.smtpHost) warnings.push("SMTP_HOST não configurado");
    if (!env.smtpPort) warnings.push("SMTP_PORT não configurado");
    if (!env.smtpUser) warnings.push("SMTP_USER não configurado");
    if (!env.smtpPass) warnings.push("SMTP_PASS não configurado");
  }

  if (env.stripeWebhookSecret && !env.stripeSecretKey) {
    warnings.push("STRIPE_SECRET_KEY não configurado");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function logEnvStatus() {
  const status = validateEnv();

  console.log("==================================");
  console.log("ENV STATUS - Megan OS");
  console.log("NODE_ENV:", env.nodeEnv);
  console.log("PORT:", env.port);
  console.log("FRONTEND_URL:", env.frontendUrl || "MISSING");
  console.log("BACKEND_URL:", env.backendUrl || "MISSING");
  console.log("DATABASE_URL:", env.databaseUrl ? maskSecret(env.databaseUrl) : "MISSING");
  console.log("JWT_SECRET:", env.jwtSecret ? maskSecret(env.jwtSecret) : "MISSING");
  console.log("JWT_EXPIRES_IN:", env.jwtExpiresIn || "MISSING");
  console.log("GOOGLE_CLIENT_ID:", env.googleClientId ? maskSecret(env.googleClientId) : "MISSING");
  console.log("GOOGLE_CLIENT_SECRET:", env.googleClientSecret ? maskSecret(env.googleClientSecret) : "MISSING");
  console.log("GOOGLE_CALLBACK_URL:", env.googleCallbackUrl || "MISSING");
  console.log("GEMINI_API_KEY:", env.geminiApiKey ? maskSecret(env.geminiApiKey) : "MISSING");
  console.log("GEMINI_MODEL:", env.geminiModel || "MISSING");
  console.log("STRIPE_SECRET_KEY:", env.stripeSecretKey ? maskSecret(env.stripeSecretKey) : "MISSING");
  console.log("STRIPE_WEBHOOK_SECRET:", env.stripeWebhookSecret ? maskSecret(env.stripeWebhookSecret) : "MISSING");
  console.log("SMTP_HOST:", env.smtpHost || "MISSING");
  console.log("SMTP_PORT:", env.smtpPort || "MISSING");
  console.log("SMTP_USER:", env.smtpUser ? maskSecret(env.smtpUser) : "MISSING");
  console.log("SMTP_PASS:", env.smtpPass ? maskSecret(env.smtpPass) : "MISSING");
  console.log("SMTP_FROM:", env.smtpFrom || "MISSING");
  console.log("SMTP_SECURE:", env.smtpSecure);

  if (status.warnings.length) {
    console.warn("WARNINGS:");
    for (const item of status.warnings) {
      console.warn(`- ${item}`);
    }
  }

  if (status.errors.length) {
    console.error("ERRORS:");
    for (const item of status.errors) {
      console.error(`- ${item}`);
    }
  }

  console.log("==================================");
}

export default env;