import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";

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
   NAVIGATION HELPERS
========================= */
function detectNavigationIntent(message) {
  const original = String(message || "").trim();
  const text = original.toLowerCase();

  const patterns = [
    "navegar para ",
    "ir para ",
    "rota para ",
    "me leve para ",
  ];

  for (const pattern of patterns) {
    const index = text.indexOf(pattern);
    if (index !== -1) {
      return {
        isNavigationRequest: true,
        destinationText: original.slice(index + pattern.length).trim(),
      };
    }
  }

  return {
    isNavigationRequest: false,
    destinationText: "",
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getKnownDestination(query) {
  const normalized = normalizeText(query);

  if (
    normalized.includes("praca da moca") ||
    normalized.includes("paraca da moca") ||
    normalized.includes("praca moca") ||
    normalized.includes("moca diadema") ||
    normalized.includes("praca da moca diadema") ||
    normalized.includes("paraca da moca diadema")
  ) {
    return {
      latitude: -23.688958,
      longitude: -46.625296,
      name: "Praça da Moça, Centro, Diadema - SP",
    };
  }

  return null;
}

/* =========================
   GEOCODE
========================= */
async function geocodeDestination(query) {
  const normalized = normalizeText(query);
  if (!normalized) return null;

  if (destinationCache.has(normalized)) {
    console.log("⚡ Cache hit:", normalized);
    return destinationCache.get(normalized);
  }

  const known = getKnownDestination(normalized);
  if (known) {
    destinationCache.set(normalized, known);
    return known;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      normalized
    )}&format=json&limit=1`;

    const res = await fetch(url);
    const data = await res.json();

    if (data && data.length > 0) {
      const result = {
        latitude: Number(data[0].lat),
        longitude: Number(data[0].lon),
        name: data[0].display_name,
      };

      destinationCache.set(normalized, result);
      return result;
    }
  } catch (err) {
    console.log("Erro geocode:", err);
  }

  return null;
}

/* =========================
   HELPERS DE DISTÂNCIA
========================= */
function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/* =========================
   HEALTH
========================= */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/* =========================
   CHAT
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const nav = detectNavigationIntent(message);

    if (nav.isNavigationRequest) {
      const destination = await geocodeDestination(nav.destinationText);

      if (destination) {
        return res.json({
          ok: true,
          reply: `🚗 Iniciando navegação para ${destination.name}`,
          meta: {
            navigation: {
              active: true,
              destination,
            },
          },
        });
      }

      return res.json({
        ok: true,
        reply: `Entendi o destino "${nav.destinationText}", mas não consegui localizar esse lugar com precisão. Tente enviar o nome com cidade e estado.`,
        meta: {
          navigation: {
            active: false,
            destination: null,
          },
        },
      });
    }

    if (ai && message) {
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: message,
        });

        const reply =
          response?.text ||
          response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Mensagem recebida";

        return res.json({
          ok: true,
          reply,
        });
      } catch (err) {
        console.error("Erro Gemini:", err);
      }
    }

    return res.json({
      ok: true,
      reply: "Mensagem recebida",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Erro interno no chat" });
  }
});

/* =========================
   DRIVING
========================= */
app.post("/api/driving", async (req, res) => {
  try {
    const { latitude, longitude, speed, destination } = req.body || {};

    const lat = Number(latitude);
    const lng = Number(longitude);
    const currentSpeed = typeof speed === "number" ? speed : Number(speed);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        ok: false,
        error: "latitude e longitude são obrigatórios",
      });
    }

    let distance = "--";
    let eta = "--";

    if (
      destination &&
      typeof destination === "object" &&
      !Number.isNaN(Number(destination.latitude)) &&
      !Number.isNaN(Number(destination.longitude))
    ) {
      const distanceKm = calculateDistanceKm(
        lat,
        lng,
        Number(destination.latitude),
        Number(destination.longitude)
      );

      distance = `${distanceKm.toFixed(2)} km`;

      const speedKmh =
        !Number.isNaN(currentSpeed) && currentSpeed > 0
          ? currentSpeed * 3.6
          : 40;

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
    console.error("Erro no /api/driving:", error);
    return res.status(500).json({
      ok: false,
      error: "Erro ao processar modo direção",
    });
  }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Megan OS rodando na porta", PORT);
});