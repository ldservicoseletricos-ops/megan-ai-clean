import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

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
app.use(express.json({ limit: "10mb" }));

/* =========================
   HELPERS
========================= */
function toFixedNumber(value, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeLocationPayload(deviceLocation) {
  if (!deviceLocation || typeof deviceLocation !== "object") return null;

  const latitude = Number(deviceLocation.latitude);
  const longitude = Number(deviceLocation.longitude);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy:
      typeof deviceLocation.accuracy === "number"
        ? deviceLocation.accuracy
        : null,
  };
}

function weatherCodeToText(code) {
  const map = {
    0: "céu limpo",
    1: "predominantemente limpo",
    2: "parcialmente nublado",
    3: "nublado",
    45: "neblina",
    48: "neblina com geada",
    51: "garoa leve",
    53: "garoa moderada",
    55: "garoa intensa",
    56: "garoa congelante leve",
    57: "garoa congelante intensa",
    61: "chuva leve",
    63: "chuva moderada",
    65: "chuva forte",
    66: "chuva congelante leve",
    67: "chuva congelante forte",
    71: "neve leve",
    73: "neve moderada",
    75: "neve forte",
    77: "grãos de neve",
    80: "pancadas de chuva leves",
    81: "pancadas de chuva moderadas",
    82: "pancadas de chuva fortes",
    85: "pancadas de neve leves",
    86: "pancadas de neve fortes",
    95: "trovoadas",
    96: "trovoadas com granizo leve",
    99: "trovoadas com granizo forte",
  };

  return map[code] || "condição climática não identificada";
}

async function reverseGeocodeFromCoords(latitude, longitude) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${encodeURIComponent(
      latitude
    )}&longitude=${encodeURIComponent(longitude)}&language=pt&format=json`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Reverse geocoding falhou (${response.status})`);
    }

    const data = await response.json();
    const first = data?.results?.[0];

    if (!first) {
      return null;
    }

    return {
      city: first.name || null,
      state: first.admin1 || null,
      country: first.country || null,
    };
  } catch (error) {
    console.error("[REVERSE GEOCODE ERROR]", error?.message || error);
    return null;
  }
}

async function getWeatherFromCoords(latitude, longitude) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&hourly=temperature_2m,weather_code` +
      `&forecast_days=1` +
      `&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo falhou (${response.status})`);
    }

    const data = await response.json();
    const current = data?.current;

    if (!current) {
      return null;
    }

    const place = await reverseGeocodeFromCoords(latitude, longitude);

    return {
      place,
      latitude: toFixedNumber(latitude, 4),
      longitude: toFixedNumber(longitude, 4),
      temperature: toFixedNumber(current.temperature_2m, 1),
      feelsLike: toFixedNumber(current.apparent_temperature, 1),
      humidity: current.relative_humidity_2m ?? null,
      windSpeed: toFixedNumber(current.wind_speed_10m, 1),
      weatherCode: current.weather_code ?? null,
      weatherText: weatherCodeToText(current.weather_code),
      time: current.time || null,
    };
  } catch (error) {
    console.error("[WEATHER ERROR]", error?.message || error);
    return null;
  }
}

function buildMeganSystemPrompt({ weather, location }) {
  const parts = [];

  parts.push(
    "Você é Megan OS, assistente humana, útil, clara, estratégica e natural. Responda em português do Brasil."
  );

  parts.push(
    "Seu estilo deve ser caloroso, profissional, direto e inteligente. Evite soar robótica."
  );

  if (location) {
    parts.push(
      `Localização aproximada do usuário: latitude ${location.latitude}, longitude ${location.longitude}.`
    );
  }

  if (weather) {
    const placeText = [
      weather?.place?.city,
      weather?.place?.state,
      weather?.place?.country,
    ]
      .filter(Boolean)
      .join(", ");

    parts.push(
      `Clima atual${placeText ? ` em ${placeText}` : ""}: ${weather.weatherText}, temperatura ${weather.temperature}°C, sensação térmica ${weather.feelsLike}°C, umidade ${weather.humidity}%, vento ${weather.windSpeed} km/h.`
    );

    parts.push(
      "Quando a pergunta do usuário envolver clima, use esses dados reais de forma natural na resposta."
    );
  }

  parts.push(
    "Se o usuário pedir algo sobre livro, negócio, organização ou estratégia, responda de forma prática e útil."
  );

  return parts.join(" ");
}

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
   CHAT COM IA + LOCALIZAÇÃO + CLIMA
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, deviceLocation } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    if (!ai) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY não configurada no backend",
      });
    }

    const normalizedLocation = normalizeLocationPayload(deviceLocation);
    const weather = normalizedLocation
      ? await getWeatherFromCoords(
          normalizedLocation.latitude,
          normalizedLocation.longitude
        )
      : null;

    const systemPrompt = buildMeganSystemPrompt({
      weather,
      location: normalizedLocation,
    });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemPrompt}\n\nMensagem do usuário: ${message}`,
            },
          ],
        },
      ],
    });

    const reply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sem resposta da IA.";

    return res.json({
      ok: true,
      reply,
      meta: {
        hasLocation: Boolean(normalizedLocation),
        weather,
      },
    });
  } catch (error) {
    console.error("[CHAT ERROR]", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao gerar resposta da Megan",
    });
  }
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
  console.log("Modelo Gemini:", GEMINI_MODEL);
  console.log("Allowed Origins:", allowedOrigins);
  console.log("==================================");
});