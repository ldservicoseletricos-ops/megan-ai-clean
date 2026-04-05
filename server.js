import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
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
  "https://hoppscotch.io",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.some((allowed) =>
          origin.startsWith(allowed)
        )
      ) {
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
    speed:
      typeof deviceLocation.speed === "number" && !Number.isNaN(deviceLocation.speed)
        ? deviceLocation.speed
        : null,
    heading:
      typeof deviceLocation.heading === "number" && !Number.isNaN(deviceLocation.heading)
        ? deviceLocation.heading
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
   NAVIGATION HELPERS
========================= */
function detectNavigationIntent(message) {
  const original = String(message || "").trim();
  const text = original.toLowerCase();

  const patterns = [
    "navegar para ",
    "navegação para ",
    "ir para ",
    "me leve para ",
    "quero ir para ",
    "rota para ",
    "abrir rota para ",
    "iniciar rota para ",
    "traçar rota para ",
  ];

  for (const pattern of patterns) {
    const index = text.indexOf(pattern);
    if (index !== -1) {
      const destinationText = original.slice(index + pattern.length).trim();
      if (destinationText) {
        return {
          isNavigationRequest: true,
          destinationText,
        };
      }
    }
  }

  return {
    isNavigationRequest: false,
    destinationText: "",
  };
}

function normalizeTextForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getKnownDestination(query) {
  const normalized = normalizeTextForMatch(query);

  const knownPlaces = [
    {
      keys: ["praca da moca", "praca da moca diadema", "praca da moca em diadema"],
      latitude: -23.686358,
      longitude: -46.622981,
      name: "Praça da Moça, Centro, Diadema, São Paulo, Brasil",
    },
    {
      keys: ["aeroporto de congonhas", "congonhas", "aeroporto congonhas"],
      latitude: -23.6261109,
      longitude: -46.6565712,
      name: "Aeroporto de Congonhas, São Paulo, Brasil",
    },
    {
      keys: ["aeroporto de guarulhos", "gru", "aeroporto internacional de guarulhos"],
      latitude: -23.435556,
      longitude: -46.473056,
      name: "Aeroporto Internacional de Guarulhos, São Paulo, Brasil",
    },
    {
      keys: ["avenida paulista", "paulista"],
      latitude: -23.5613991,
      longitude: -46.6565712,
      name: "Avenida Paulista, São Paulo, Brasil",
    },
  ];

  for (const place of knownPlaces) {
    if (place.keys.some((key) => normalized.includes(key))) {
      return {
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name,
      };
    }
  }

  return null;
}

async function geocodeWithOpenMeteo(query) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(query)}` +
    `&count=5` +
    `&language=pt` +
    `&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo geocoding falhou (${response.status})`);
  }

  const data = await response.json();
  const first = data?.results?.[0];

  if (!first) return null;

  return {
    latitude: first.latitude,
    longitude: first.longitude,
    name: [first.name, first.admin1, first.country].filter(Boolean).join(", "),
  };
}

async function geocodeWithNominatim(query) {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}` +
    `&format=jsonv2` +
    `&limit=1` +
    `&addressdetails=1`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Megan-OS/1.0",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim falhou (${response.status})`);
  }

  const data = await response.json();
  const first = data?.[0];

  if (!first) return null;

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    name: first.display_name || query,
  };
}

async function geocodeDestination(query) {
  const normalized = String(query || "").trim();
  if (!normalized) return null;

  const knownPlace = getKnownDestination(normalized);
  if (knownPlace) return knownPlace;

  const candidates = [
    normalized,
    `${normalized}, Brasil`,
    `${normalized}, São Paulo, Brasil`,
    `${normalized}, Diadema, São Paulo, Brasil`,
  ];

  for (const candidate of candidates) {
    try {
      const openMeteoResult = await geocodeWithOpenMeteo(candidate);
      if (openMeteoResult) return openMeteoResult;
    } catch (error) {
      console.error("[OPEN_METEO GEOCODING ERROR]", error?.message || error);
    }

    try {
      const nominatimResult = await geocodeWithNominatim(candidate);
      if (nominatimResult) return nominatimResult;
    } catch (error) {
      console.error("[NOMINATIM GEOCODING ERROR]", error?.message || error);
    }
  }

  return null;
}

/* =========================
   DRIVING MODE / RADAR
========================= */
const RADARS = [
  {
    id: "radar-1",
    name: "Radar exemplo - Centro SP",
    lat: -23.55052,
    lng: -46.633308,
    speedLimit: 60,
    type: "fixo",
  },
];

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
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

function metersFromKm(km) {
  return Math.round(km * 1000);
}

function normalizeSpeedKmh(speed) {
  if (typeof speed !== "number" || Number.isNaN(speed)) return null;

  const kmh = speed * 3.6;
  return Math.round(kmh);
}

function findNearestRadar(latitude, longitude) {
  let nearest = null;

  for (const radar of RADARS) {
    const distanceKm = calculateDistanceInKm(
      latitude,
      longitude,
      radar.lat,
      radar.lng
    );

    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = {
        ...radar,
        distanceKm,
        distanceMeters: metersFromKm(distanceKm),
      };
    }
  }

  return nearest;
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
   NAVIGATION RESOLVE API
========================= */
app.post("/api/navigation/resolve", async (req, res) => {
  try {
    const { message } = req.body || {};

    const navigationIntent = detectNavigationIntent(message);

    if (!navigationIntent.isNavigationRequest) {
      return res.json({
        ok: true,
        navigation: {
          active: false,
          destination: null,
        },
      });
    }

    const destination = await geocodeDestination(navigationIntent.destinationText);

    if (!destination) {
      return res.json({
        ok: true,
        navigation: {
          active: false,
          destination: null,
        },
      });
    }

    return res.json({
      ok: true,
      navigation: {
        active: true,
        destination,
      },
    });
  } catch (error) {
    console.error("[NAVIGATION RESOLVE ERROR]", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao resolver destino da navegação",
    });
  }
});

/* =========================
   CHAT COM IA + LOCALIZAÇÃO + CLIMA + NAVEGAÇÃO
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

    const navigationIntent = detectNavigationIntent(message);
    if (navigationIntent.isNavigationRequest) {
      const destination = await geocodeDestination(navigationIntent.destinationText);

      if (destination) {
        return res.json({
          ok: true,
          reply: `Certo, abrindo a navegação para ${destination.name}.`,
          meta: {
            hasLocation: Boolean(normalizedLocation),
            weather,
            navigation: {
              active: true,
              destination,
            },
          },
        });
      }

      return res.json({
        ok: true,
        reply: `Entendi o destino "${navigationIntent.destinationText}", mas não consegui localizar esse lugar com precisão. Tente enviar o nome com cidade e estado.`,
        meta: {
          hasLocation: Boolean(normalizedLocation),
          weather,
          navigation: null,
        },
      });
    }

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
        navigation: null,
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
   DRIVING API
========================= */
app.post("/api/driving", async (req, res) => {
  try {
    const { latitude, longitude, speed, heading } = req.body || {};

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        ok: false,
        error: "latitude e longitude são obrigatórios",
      });
    }

    const nearestRadar = findNearestRadar(lat, lng);
    const speedKmh = normalizeSpeedKmh(
      typeof speed === "number" ? speed : Number(speed)
    );

    let alert = null;

    if (nearestRadar && nearestRadar.distanceMeters <= 800) {
      alert = `🚨 Radar ${nearestRadar.type} à frente em ${nearestRadar.distanceMeters} m. Limite: ${nearestRadar.speedLimit} km/h.`;
    }

    if (
      nearestRadar &&
      nearestRadar.distanceMeters <= 800 &&
      speedKmh !== null &&
      speedKmh > nearestRadar.speedLimit
    ) {
      alert = `🚨 Atenção: radar ${nearestRadar.type} em ${nearestRadar.distanceMeters} m. Você está a ${speedKmh} km/h e o limite é ${nearestRadar.speedLimit} km/h.`;
    }

    return res.json({
      ok: true,
      mode: "driving",
      alert,
      radar: nearestRadar
        ? {
            id: nearestRadar.id,
            name: nearestRadar.name,
            type: nearestRadar.type,
            distanceMeters: nearestRadar.distanceMeters,
            speedLimit: nearestRadar.speedLimit,
            latitude: nearestRadar.lat,
            longitude: nearestRadar.lng,
          }
        : null,
      meta: {
        speedKmh,
        heading:
          typeof heading === "number" && !Number.isNaN(heading)
            ? Math.round(heading)
            : null,
        hasRadarBase: RADARS.length > 0,
      },
    });
  } catch (error) {
    console.error("[DRIVING ERROR]", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao processar modo direção",
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
  console.log("Modo direção / radares:", `/api/driving (${RADARS.length} radar(es) na base)`);
  console.log("==================================");
});