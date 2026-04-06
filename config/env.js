function required(name, fallback = "") {
  return process.env[name] || fallback;
}

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || "";

  if (!url) {
    console.warn("⚠️ DATABASE_URL não definida");
  }

  return url;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 10000),

  // Banco
  databaseUrl: getDatabaseUrl(),

  // Auth
  jwtSecret: required("JWT_SECRET", "megan_jwt_dev_secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || "https://megan-ai-qp42.vercel.app",

  // SMTP
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || "false") === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFromName: process.env.SMTP_FROM_NAME || "Megan OS",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "",

  // Gemini
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",

  // Google
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePriceIdPro: process.env.STRIPE_PRICE_ID_PRO || "",
  stripePriceIdEnterprise: process.env.STRIPE_PRICE_ID_ENTERPRISE || "",
};