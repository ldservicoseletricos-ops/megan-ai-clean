import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   CORS DEFINITIVO
========================= */
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",

  // Frontends Vercel
  "https://megan-ai-clean-wnst.vercel.app",
  "https://megan-ai-clean.vercel.app",
  "https://megan-ai-qp42.vercel.app",

  // valor vindo do .env
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ CORS bloqueado:", origin);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json());

/* =========================
   HEALTH
========================= */
app.get("/", (_req, res) => {
  return res.json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    time: new Date().toISOString(),
  });
});

app.get("/api/health", (_req, res) => {
  return res.json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    database: "configurado",
    time: new Date().toISOString(),
  });
});

/* =========================
   SYSTEM
========================= */
app.get("/api/system/health", (_req, res) => {
  return res.json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    time: new Date().toISOString(),
  });
});

app.get("/api/system/status", (_req, res) => {
  return res.json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    user: null,
    time: new Date().toISOString(),
  });
});

/* =========================
   CHAT
========================= */
app.post("/api/chat", (req, res) => {
  const { message } = req.body || {};

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: "Mensagem é obrigatória",
    });
  }

  return res.json({
    ok: true,
    reply: `Megan recebeu: ${message}`,
  });
});

/* =========================
   404
========================= */
app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    error: "Rota não encontrada",
    path: req.originalUrl,
  });
});

/* =========================
   ERROR
========================= */
app.use((error, _req, res, _next) => {
  console.error("[GLOBAL ERROR]", error);

  return res.status(500).json({
    ok: false,
    error: error?.message || "Erro interno do servidor",
  });
});

/* =========================
   START
========================= */
app.listen(PORT, "0.0.0.0", () => {
  console.log("==================================");
  console.log("🚀 Megan OS Backend iniciado");
  console.log("Porta:", PORT);
  console.log("Frontend:", process.env.FRONTEND_URL);
  console.log("Allowed Origins:", allowedOrigins);
  console.log("==================================");
});