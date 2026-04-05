import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

/* =========================
   APP INIT (TEM QUE VIR PRIMEIRO)
========================= */
const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   GEMINI INIT
========================= */
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/* =========================
   CORS
========================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://megan-ai-clean-wnst.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

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
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Megan OS Backend",
    status: "online",
    time: new Date().toISOString(),
  });
});

/* =========================
   CHAT COM IA REAL
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
    });

    const reply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sem resposta da IA";

    res.json({
      ok: true,
      reply,
    });
  } catch (err) {
    console.error("Erro Gemini:", err);

    res.status(500).json({
      ok: false,
      error: "Erro ao gerar resposta",
    });
  }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Megan OS rodando na porta", PORT);
});