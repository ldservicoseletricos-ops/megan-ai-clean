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

  // 🔥 FRONTEND VERCEL (COLOQUE O SEU REAL AQUI)
  "https://megan-ai-clean.vercel.app",
  "https://megan-ai-qp42.vercel.app",

  // fallback
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin: function (origin, callback) {
      // permite requests sem origin (ex: Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ CORS bloqueado:", origin);
      return callback(new Error("Not allowed by CORS"));
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
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    time: new Date().toISOString(),
  });
});

/* =========================
   CHAT (TESTE)
========================= */
app.post("/api/chat", (req, res) => {
  const { message } = req.body;

  return res.json({
    reply: `Megan recebeu: ${message}`,
  });
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("==================================");
  console.log("🚀 Megan OS Backend iniciado");
  console.log("Porta:", PORT);
  console.log("Frontend:", process.env.FRONTEND_URL);
  console.log("==================================");
});