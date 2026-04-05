import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { getPool } from "./config/db.js";

import { authRouter } from "./routes/auth.route.js";
import billingRouter from "./routes/billing.route.js";
import chatRouter from "./routes/chat.route.js";
import memoryRouter from "./routes/memory.route.js";
import systemRouter from "./routes/system.route.js";
import toolsRouter from "./routes/tools.route.js";

const app = express();
const PORT = env.port || 10000;
const pool = getPool();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function buildAllowedOrigins() {
  const origins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://megan-ai-qp42.vercel.app",
    "https://megan-ai.onrender.com",
  ]);

  const frontendUrl = normalizeUrl(env.frontendUrl || process.env.FRONTEND_URL);
  if (frontendUrl) {
    origins.add(frontendUrl);
  }

  return Array.from(origins);
}

const allowedOrigins = buildAllowedOrigins();

app.disable("x-powered-by");

app.use(
  "/api/billing/webhook",
  express.raw({ type: "application/json" })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const normalizedOrigin = normalizeUrl(origin);

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn("[CORS] Origem bloqueada:", origin);
      return callback(new Error(`Origem não permitida por CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, _res, next) => {
  req.db = pool;
  next();
});

app.get("/", (_req, res) => {
  return res.status(200).json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    time: new Date().toISOString(),
  });
});

app.get("/api/health", (_req, res) => {
  return res.status(200).json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    database: pool ? "configurado" : "não configurado",
    time: new Date().toISOString(),
  });
});

app.use("/api/system", systemRouter);
app.use("/api/auth", authRouter);
app.use("/api/billing", billingRouter);
app.use("/api/chat", chatRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/tools", toolsRouter);

app.use((req, res) => {
  return res.status(404).json({
    ok: false,
    error: "Rota não encontrada",
    path: req.originalUrl,
  });
});

app.use((error, _req, res, _next) => {
  console.error("[GLOBAL ERROR]", error);

  if (res.headersSent) {
    return;
  }

  return res.status(500).json({
    ok: false,
    error: error?.message || "Erro interno do servidor",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("==================================");
  console.log("Megan OS Backend iniciado");
  console.log("Porta:", PORT);
  console.log("Ambiente:", env.nodeEnv);
  console.log("Frontend:", env.frontendUrl);
  console.log("Banco:", pool ? "configurado" : "não configurado");
  console.log("Health:", "/api/health");
  console.log("==================================");
});