function getString(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function getNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getBoolean(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;

  return fallback;
}

function getDatabaseUrl() {
  const url = getString("DATABASE_URL", "");

  if (!url) {
    console.warn("⚠️ DATABASE_URL não definida");
  }

  return url;
}

export const env = {
  nodeEnv: getString("NODE_ENV", "development"),
  port: getNumber("PORT", 10000),
  databaseUrl: getDatabaseUrl(),

  jwtSecret: getString("JWT_SECRET", "megan_jwt_dev_secret"),
  jwtExpiresIn: getString("JWT_EXPIRES_IN", "7d"),

  frontendUrl: getString("FRONTEND_URL", "https://megan-ai-qp42.vercel.app"),

  smtpHost: getString("SMTP_HOST", ""),
  smtpPort: getNumber("SMTP_PORT", 587),
  smtpSecure: getBoolean("SMTP_SECURE", false),
  smtpUser: getString("SMTP_USER", ""),
  smtpPass: getString("SMTP_PASS", ""),
  smtpFromName: getString("SMTP_FROM_NAME", "Megan OS"),
  smtpFromEmail: getString("SMTP_FROM_EMAIL", getString("SMTP_USER", "")),

  geminiApiKey: getString("GEMINI_API_KEY", getString("GOOGLE_API_KEY", "")),
  geminiModel: getString("GEMINI_MODEL", "gemini-2.5-flash"),
  openAiApiKey: getString("OPENAI_API_KEY", ""),
  allowMockAi: getBoolean("ALLOW_MOCK_AI", false),

  googleClientId: getString("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: getString("GOOGLE_CLIENT_SECRET", ""),
  googleCallbackUrl: getString("GOOGLE_CALLBACK_URL", ""),
  googleMapsApiKey: getString("GOOGLE_MAPS_API_KEY", ""),

  defaultTimezone: getString("DEFAULT_TIMEZONE", "America/Sao_Paulo"),
  defaultWeatherCity: getString("DEFAULT_WEATHER_CITY", "Sao Paulo"),
  defaultOriginCity: getString("DEFAULT_ORIGIN_CITY", "Diadema, SP"),

  stripeSecretKey: getString("STRIPE_SECRET_KEY", ""),
  stripeWebhookSecret: getString("STRIPE_WEBHOOK_SECRET", ""),
  stripePriceId: getString("STRIPE_PRICE_ID", ""),
  stripePriceIdPro: getString("STRIPE_PRICE_ID_PRO", ""),
  stripePriceIdEnterprise: getString("STRIPE_PRICE_ID_ENTERPRISE", ""),

  maxUploadMb: getNumber("MAX_UPLOAD_MB", 10),
  maxUploadFiles: getNumber("MAX_UPLOAD_FILES", 5),
};