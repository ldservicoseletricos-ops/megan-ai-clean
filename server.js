import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";

import navigationRouter from "./routes/navigation.route.js";
import drivingRouter from "./routes/driving.route.js";

dotenv.config();

/* =========================
   CACHE GLOBAL
========================= */
const destinationCache = new Map();

// 🔥 NOVO CACHE DE CLIMA
const weatherCache = new Map();

/* =========================
   FAVORITOS / HISTÓRICO / CONTEXTO
========================= */
const favoriteDestinations = [
  {
    id: "home",
    label: "Casa",
    address: "Praça da Moça, Centro, Diadema - SP",
  },
  {
    id: "work",
    label: "Trabalho",
    address: "Rua Presidente Wenceslau, Eldorado, Diadema - SP, Brasil",
  },
];

const recentDestinations = [];
let activeNavigationContext = {
  active: false,
  destination: null,
  startedAt: null,
};

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
   HELPERS
========================= */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* =========================
   WEATHER MAP
========================= */
function weatherCodeToText(code) {
  const map = {
    0: "céu limpo",
    1: "predominantemente limpo",
    2: "parcialmente nublado",
    3: "nublado",
    61: "chuva leve",
    63: "chuva moderada",
    65: "chuva forte",
    95: "trovoadas",
  };

  return map[code] || "condição não identificada";
}

/* =========================
   🔥 CLIMA COM CACHE
========================= */
async function getWeatherFromCoords(latitude, longitude) {
  const cacheKey = `${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
  const now = Date.now();

  const cached = weatherCache.get(cacheKey);

  if (cached && now - cached.timestamp < 10 * 60 * 1000) {
    console.log("⚡ Clima vindo do cache");
    return cached.data;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&timezone=auto`;

    const res = await fetch(url);

    if (!res.ok) {
      console.error("❌ Erro HTTP clima:", res.status);

      if (cached) return cached.data;
      return null;
    }

    const data = await res.json();
    const current = data?.current;

    if (!current) {
      if (cached) return cached.data;
      return null;
    }

    const result = {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      windSpeed: current.wind_speed_10m,
      humidity: current.relative_humidity_2m,
      weatherText: weatherCodeToText(current.weather_code),
    };

    weatherCache.set(cacheKey, {
      data: result,
      timestamp: now,
    });

    return result;
  } catch (err) {
    console.error("❌ Erro clima:", err);

    if (cached) return cached.data;
    return null;
  }
}

/* =========================
   CHAT
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, deviceLocation } = req.body || {};
    const text = String(message || "").toLowerCase();

    if (text.includes("clima") || text.includes("tempo")) {
      if (!deviceLocation) {
        return res.json({
          ok: true,
          reply: "Preciso da sua localização para ver o clima.",
        });
      }

      const weather = await getWeatherFromCoords(
        deviceLocation.latitude,
        deviceLocation.longitude
      );

      if (weather) {
        return res.json({
          ok: true,
          reply:
            `🌤️ Clima agora:\n` +
            `Temperatura: ${weather.temperature}°C\n` +
            `Sensação: ${weather.feelsLike}°C\n` +
            `Condição: ${weather.weatherText}\n` +
            `Umidade: ${weather.humidity}%\n` +
            `Vento: ${weather.windSpeed} km/h`,
        });
      }

      return res.json({
        ok: true,
        reply:
          "Não consegui atualizar o clima agora, mas posso tentar novamente em instantes.",
      });
    }

    return res.json({
      ok: true,
      reply: "Mensagem recebida",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

/* =========================
   ROTAS
========================= */
app.use("/api/driving/radar", drivingRouter);
app.use("/api/navigation", navigationRouter);

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Megan OS rodando na porta", PORT);
});