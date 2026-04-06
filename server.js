import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";

// 🔥 NOVAS ROTAS
import navigationRouter from "./routes/navigation.route.js";
import drivingRouter from "./routes/driving.route.js";

dotenv.config();

/* =========================
   CACHE GLOBAL
========================= */
const destinationCache = new Map();

/* =========================
   APP INIT
========================= */
const app = express();
const PORT = process.env.PORT || 10000;

/* =========================
   GEMINI INIT
========================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

/* =========================
   CORS
========================= */
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://megan-ai-clean-wnst.vercel.app",
  "https://hoppscotch.io",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
        return callback(null, true);
      }

      console.log("❌ CORS bloqueado:", origin);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

/* =========================
   HELPERS (mantidos)
========================= */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* =========================
   HEALTH
========================= */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/* =========================
   CHAT (mantido)
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (ai && message) {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: message,
      });

      const reply =
        response?.text ||
        response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Mensagem recebida";

      return res.json({ ok: true, reply });
    }

    return res.json({ ok: true, reply: "Mensagem recebida" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

/* =========================
   DRIVING (mantido + compatível)
========================= */
app.post("/api/driving", async (req, res) => {
  try {
    const { latitude, longitude, speed, destination } = req.body || {};

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ ok: false });
    }

    let distance = "--";
    let eta = "--";

    if (destination?.latitude && destination?.longitude) {
      const distanceKm = calculateDistanceKm(
        lat,
        lng,
        Number(destination.latitude),
        Number(destination.longitude)
      );

      distance = `${distanceKm.toFixed(2)} km`;

      const speedKmh = speed ? speed * 3.6 : 40;
      const minutes = Math.max(1, Math.round((distanceKm / speedKmh) * 60));
      eta = `${minutes} min`;
    }

    return res.json({
      ok: true,
      alert: null,
      distance,
      eta,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

/* =========================
   🔥 NOVAS ROTAS PROFISSIONAIS
========================= */

// 🔥 radar backend
app.use("/api/driving/radar", drivingRouter);

// 🔥 clima + trânsito
app.use("/api/navigation", navigationRouter);

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Megan OS rodando na porta", PORT);
});