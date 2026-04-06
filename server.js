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
   HELPERS
========================= */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function cleanDestinationText(text) {
  return String(text || "")
    .replace(/^navegar para\s+/i, "")
    .replace(/^navegar pra\s+/i, "")
    .replace(/^ir para\s+/i, "")
    .replace(/^ir pra\s+/i, "")
    .replace(/^rota para\s+/i, "")
    .replace(/^me leve para\s+/i, "")
    .replace(/^me leva para\s+/i, "")
    .replace(/^me leve pra\s+/i, "")
    .replace(/^me leva pra\s+/i, "")
    .replace(/^abrir rota para\s+/i, "")
    .replace(/^abrir mapa para\s+/i, "")
    .replace(/^navegar\s+/i, "")
    .replace(/^rota\s+/i, "")
    .trim();
}

function detectNavigationIntent(message) {
  const original = String(message || "").trim();
  const text = normalizeText(original);

  const patterns = [
    "navegar para ",
    "navegar pra ",
    "ir para ",
    "ir pra ",
    "rota para ",
    "me leve para ",
    "me leva para ",
    "me leve pra ",
    "me leva pra ",
    "abrir rota para ",
    "abrir mapa para ",
    "navegar ",
    "rota ",
  ];

  for (const pattern of patterns) {
    if (text.startsWith(pattern)) {
      return {
        isNavigationRequest: true,
        destinationText: cleanDestinationText(original),
      };
    }
  }

  const looksLikeAddress =
    text.includes("rua ") ||
    text.includes("avenida ") ||
    text.includes("av ") ||
    text.includes("estrada ") ||
    text.includes("rodovia ") ||
    text.includes("travessa ") ||
    text.includes("alameda ") ||
    text.includes("praca ") ||
    text.includes("praça ");

  if (looksLikeAddress) {
    return {
      isNavigationRequest: true,
      destinationText: original,
    };
  }

  return {
    isNavigationRequest: false,
    destinationText: "",
  };
}

function isWeatherRequest(message) {
  const normalized = normalizeText(message);

  return [
    "clima",
    "tempo",
    "temperatura",
    "previsao",
    "previsão",
    "vai chover",
    "clima agora",
    "como esta o clima",
    "como está o clima",
    "qual o clima",
    "como está o tempo",
    "como esta o tempo",
  ].some((term) => normalized.includes(normalizeText(term)));
}

function isLocationQuestion(message) {
  const normalized = normalizeText(message);

  return [
    "onde estou",
    "onde eu estou",
    "minha localizacao",
    "minha localização",
    "qual minha localizacao",
    "qual minha localização",
    "qual a minha localizacao",
    "qual a minha localização",
    "minha posicao",
    "minha posição",
    "qual minha posicao",
    "qual minha posição",
    "qual a minha posicao",
    "qual a minha posição",
    "onde to",
    "onde tô",
    "onde estou agora",
    "minha localizacao atual",
    "minha localização atual",
  ].some((term) => normalized.includes(normalizeText(term)));
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

  return map[code] || "condição não identificada";
}

async function getWeatherFromCoords(latitude, longitude) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&timezone=auto`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Open-Meteo HTTP ERROR:", res.status, text);
      return null;
    }

    const data = await res.json();
    const current = data?.current;

    if (!current) {
      console.error("❌ Open-Meteo sem current:", data);
      return null;
    }

    return {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      windSpeed: current.wind_speed_10m,
      humidity: current.relative_humidity_2m,
      weatherCode: current.weather_code,
      weatherText: weatherCodeToText(current.weather_code),
      time: current.time || null,
    };
  } catch (err) {
    console.error("❌ Erro clima:", err);
    return null;
  }
}

function buildWeatherReply(weather) {
  return (
    `🌤️ Clima agora no seu local:\n` +
    `Temperatura: ${weather.temperature}°C\n` +
    `Sensação térmica: ${weather.feelsLike}°C\n` +
    `Condição: ${weather.weatherText}\n` +
    `Umidade: ${weather.humidity}%\n` +
    `Vento: ${weather.windSpeed} km/h`
  );
}

async function getAddressFromCoords(latitude, longitude) {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

  if (!googleMapsApiKey) {
    console.error("❌ GOOGLE_MAPS_API_KEY não configurada no backend");
    return null;
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}` +
      `&key=${encodeURIComponent(googleMapsApiKey)}` +
      `&region=br` +
      `&language=pt-BR`;

    const res = await fetch(url);
    const data = await res.json();

    if (
      data?.status === "OK" &&
      Array.isArray(data.results) &&
      data.results.length > 0
    ) {
      return data.results[0]?.formatted_address || null;
    }

    console.log("⚠️ Reverse geocoding sem resultado:", data?.status);
    return null;
  } catch (error) {
    console.error("❌ Erro reverse geocoding:", error);
    return null;
  }
}

function buildLocationReply(address, location) {
  const latitude = Number(location.latitude).toFixed(6);
  const longitude = Number(location.longitude).toFixed(6);
  const accuracy =
    typeof location.accuracy === "number"
      ? `${Math.round(location.accuracy)} m`
      : "N/A";

  if (address) {
    return (
      `📍 Você está próximo de:\n${address}\n\n` +
      `🌍 Coordenadas:\n${latitude}, ${longitude}\n\n` +
      `📡 Precisão aproximada: ${accuracy}`
    );
  }

  return (
    `📍 Recebi sua localização atual.\n\n` +
    `🌍 Coordenadas:\n${latitude}, ${longitude}\n\n` +
    `📡 Precisão aproximada: ${accuracy}`
  );
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

  if (
    normalized.includes("rua presidente wenceslau") ||
    normalized.includes("rua presidente venceslau") ||
    normalized.includes("presidente wenceslau diadema") ||
    normalized.includes("presidente venceslau diadema")
  ) {
    return {
      latitude: -23.7257724,
      longitude: -46.6157211,
      name: "Rua Presidente Wenceslau, Eldorado, Diadema - SP, Brasil",
    };
  }

  return null;
}

async function googleGeocode(address) {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

  if (!googleMapsApiKey) {
    console.error("❌ GOOGLE_MAPS_API_KEY não configurada no backend");
    return null;
  }

  console.log("🔎 Geocode:", address);

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(googleMapsApiKey)}` +
    `&region=br` +
    `&language=pt-BR`;

  const res = await fetch(url);
  const data = await res.json();

  if (
    data?.status === "OK" &&
    Array.isArray(data.results) &&
    data.results.length > 0
  ) {
    const result = data.results[0];

    return {
      latitude: Number(result.geometry.location.lat),
      longitude: Number(result.geometry.location.lng),
      name: result.formatted_address,
    };
  }

  console.log("⚠️ Google Geocoding sem resultado:", data?.status, address);
  return null;
}

function buildAddressCandidates(cleaned) {
  const candidates = new Set();

  candidates.add(cleaned);
  candidates.add(`${cleaned}, Diadema, SP`);
  candidates.add(`${cleaned}, Diadema, São Paulo`);
  candidates.add(`${cleaned}, Diadema, São Paulo, Brasil`);
  candidates.add(`${cleaned}, São Bernardo do Campo, SP, Brasil`);
  candidates.add(`${cleaned}, São Paulo, SP, Brasil`);
  candidates.add(`${cleaned}, Brasil`);

  const normalized = normalizeText(cleaned);

  if (normalized.includes("venceslau")) {
    const fixed = cleaned.replace(/venceslau/gi, "Wenceslau");
    candidates.add(fixed);
    candidates.add(`${fixed}, Diadema, SP`);
    candidates.add(`${fixed}, Diadema, São Paulo, Brasil`);
  }

  if (normalized.includes("wenceslau")) {
    const fixed = cleaned.replace(/wenceslau/gi, "Venceslau");
    candidates.add(fixed);
    candidates.add(`${fixed}, Diadema, SP`);
    candidates.add(`${fixed}, Diadema, São Paulo, Brasil`);
  }

  candidates.add(`${cleaned}, 100, Diadema, SP`);
  candidates.add(`${cleaned}, 1, Diadema, SP`);

  return Array.from(candidates);
}

function addRecentDestination(destination) {
  if (!destination?.name) return;

  const normalized = normalizeText(destination.name);
  const filtered = recentDestinations.filter(
    (item) => normalizeText(item.name) !== normalized
  );

  filtered.unshift({
    name: destination.name,
    latitude: destination.latitude,
    longitude: destination.longitude,
  });

  recentDestinations.length = 0;
  recentDestinations.push(...filtered.slice(0, 6));
}

function setActiveNavigation(destination) {
  activeNavigationContext = {
    active: true,
    destination,
    startedAt: new Date().toISOString(),
  };
}

function clearActiveNavigation() {
  activeNavigationContext = {
    active: false,
    destination: null,
    startedAt: null,
  };
}

function hasActiveNavigation() {
  return Boolean(activeNavigationContext.active && activeNavigationContext.destination);
}

function isCancelNavigationRequest(message) {
  const text = normalizeText(message);

  return [
    "cancelar rota",
    "parar rota",
    "encerrar rota",
    "fechar rota",
    "cancelar navegacao",
    "cancelar navegação",
    "parar navegacao",
    "parar navegação",
  ].includes(text);
}

function isCurrentDestinationRequest(message) {
  const text = normalizeText(message);

  return [
    "qual o destino atual",
    "qual destino atual",
    "para onde estou indo",
    "qual rota ativa",
    "qual a rota ativa",
    "destino atual",
  ].includes(text);
}

function isEtaRequest(message) {
  const text = normalizeText(message);

  return [
    "quanto falta",
    "quanto tempo falta",
    "quanto tempo ate la",
    "quanto tempo até la",
    "quanto tempo ate lá",
    "quanto tempo até lá",
    "chego em quanto tempo",
    "qual o eta",
    "quanto resta",
  ].includes(text);
}

function isTrafficToDestinationRequest(message) {
  const text = normalizeText(message);

  return [
    "tem transito ate la",
    "tem trânsito até lá",
    "tem transito até la",
    "tem trânsito ate la",
    "como esta o transito ate la",
    "como está o trânsito até lá",
    "transito ate la",
    "trânsito até lá",
  ].includes(text);
}

function findFavoriteDestinationByMessage(message) {
  const text = normalizeText(message);

  if (
    text === "casa" ||
    text === "me leva para casa" ||
    text === "me leva pra casa" ||
    text === "ir para casa" ||
    text === "ir pra casa" ||
    text === "navegar para casa" ||
    text === "navegar pra casa"
  ) {
    return favoriteDestinations.find((item) => item.id === "home") || null;
  }

  if (
    text === "trabalho" ||
    text === "me leva para o trabalho" ||
    text === "me leva pro trabalho" ||
    text === "ir para o trabalho" ||
    text === "ir pro trabalho" ||
    text === "navegar para o trabalho" ||
    text === "navegar pro trabalho"
  ) {
    return favoriteDestinations.find((item) => item.id === "work") || null;
  }

  return null;
}

async function geocodeDestination(query) {
  const cleaned = cleanDestinationText(query);
  const normalized = normalizeText(cleaned);

  if (!normalized) return null;

  if (destinationCache.has(normalized)) {
    return destinationCache.get(normalized);
  }

  const known = getKnownDestination(normalized);
  if (known) {
    destinationCache.set(normalized, known);
    return known;
  }

  const favorite = favoriteDestinations.find(
    (item) =>
      normalizeText(item.label) === normalized ||
      normalizeText(item.address) === normalized
  );

  if (favorite) {
    const result = await googleGeocode(favorite.address);
    if (result) {
      destinationCache.set(normalized, result);
      return result;
    }
  }

  const candidates = buildAddressCandidates(cleaned);

  for (const candidate of candidates) {
    try {
      const result = await googleGeocode(candidate);

      if (result) {
        destinationCache.set(normalized, result);
        return result;
      }
    } catch (err) {
      console.log("Erro geocode Google:", err);
    }
  }

  return null;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildDistanceEtaReply(deviceLocation, destination) {
  if (!deviceLocation || !destination) {
    return {
      distance: "--",
      eta: "--",
      reply: "Preciso da localização atual para calcular o trajeto.",
    };
  }

  const distanceKm = calculateDistanceKm(
    Number(deviceLocation.latitude),
    Number(deviceLocation.longitude),
    Number(destination.latitude),
    Number(destination.longitude)
  );

  const distance = `${distanceKm.toFixed(2)} km`;
  const averageSpeedKmh = 40;
  const minutes = Math.max(1, Math.round((distanceKm / averageSpeedKmh) * 60));
  const eta = `${minutes} min`;

  return {
    distance,
    eta,
    reply: `📍 Destino atual: ${destination.name}\nDistância aproximada: ${distance}\nTempo estimado: ${eta}`,
  };
}

function buildLocalSuggestionCandidates(input) {
  const normalizedInput = normalizeText(input);
  const localCandidates = [];

  for (const item of favoriteDestinations) {
    localCandidates.push({
      text: `${item.label} — ${item.address}`,
      placeId: "",
      type: "favorite",
      address: item.address,
    });

    localCandidates.push({
      text: item.label,
      placeId: "",
      type: "favorite",
      address: item.address,
    });

    localCandidates.push({
      text: item.address,
      placeId: "",
      type: "favorite",
      address: item.address,
    });
  }

  for (const item of recentDestinations) {
    localCandidates.push({
      text: item.name,
      placeId: "",
      type: "recent",
      address: item.name,
    });
  }

  localCandidates.push(
    {
      text: "Praça da Moça, Centro, Diadema - SP",
      placeId: "",
      type: "known",
      address: "Praça da Moça, Centro, Diadema - SP",
    },
    {
      text: "Rua Presidente Wenceslau, Eldorado, Diadema - SP, Brasil",
      placeId: "",
      type: "known",
      address: "Rua Presidente Wenceslau, Eldorado, Diadema - SP, Brasil",
    }
  );

  const filtered = localCandidates.filter((item) => {
    const normalizedText = normalizeText(item.text);
    return (
      normalizedText.includes(normalizedInput) ||
      normalizedInput.includes(normalizedText)
    );
  });

  const unique = [];
  const seen = new Set();

  for (const item of filtered) {
    const key = `${item.type}:${normalizeText(item.text)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

async function rankSuggestionsByPriority(items, deviceLocation) {
  const normalizedLocation = normalizeLocationPayload(deviceLocation);

  const ranked = await Promise.all(
    items.map(async (item) => {
      let distance = null;

      if (
        normalizedLocation &&
        item.address &&
        item.type !== "google"
      ) {
        const geo = await geocodeDestination(item.address);
        if (geo) {
          distance = calculateDistanceKm(
            normalizedLocation.latitude,
            normalizedLocation.longitude,
            geo.latitude,
            geo.longitude
          );
        }
      }

      return {
        ...item,
        distance,
      };
    })
  );

  const priority = {
    favorite: 0,
    known: 1,
    recent: 2,
    google: 3,
  };

  ranked.sort((a, b) => {
    const pa = priority[a.type] ?? 99;
    const pb = priority[b.type] ?? 99;

    if (pa !== pb) return pa - pb;

    const da = typeof a.distance === "number" ? a.distance : 999999;
    const db = typeof b.distance === "number" ? b.distance : 999999;

    if (da !== db) return da - db;

    return a.text.localeCompare(b.text, "pt-BR");
  });

  return ranked;
}

/* =========================
   AUTOCOMPLETE GOOGLE PLACES
========================= */
async function getPlaceAutocompleteSuggestions(input, deviceLocation, sessionToken) {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  const cleanedInput = String(input || "").trim();

  if (cleanedInput.length < 2) return [];

  const localFallback = buildLocalSuggestionCandidates(cleanedInput);

  let googleSuggestions = [];

  if (googleMapsApiKey) {
    const body = {
      input: cleanedInput,
      languageCode: "pt-BR",
      regionCode: "BR",
      includedRegionCodes: ["br"],
      sessionToken: sessionToken || undefined,
      includeQueryPredictions: false,
    };

    const normalizedLocation = normalizeLocationPayload(deviceLocation);

    if (normalizedLocation) {
      body.locationBias = {
        circle: {
          center: {
            latitude: normalizedLocation.latitude,
            longitude: normalizedLocation.longitude,
          },
          radius: 50000,
        },
      };
    }

    try {
      const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleMapsApiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("❌ Places Autocomplete HTTP ERROR:", res.status, data);
      } else if (Array.isArray(data?.suggestions)) {
        googleSuggestions = data.suggestions
          .map((item) => {
            const prediction = item?.placePrediction;
            const text = prediction?.text?.text || "";
            const placeId = prediction?.placeId || "";

            if (!text) return null;

            return {
              text,
              placeId,
              type: "google",
              address: text,
            };
          })
          .filter(Boolean);
      }
    } catch (error) {
      console.error("❌ Erro autocomplete Google Places:", error);
    }
  } else {
    console.error("❌ GOOGLE_MAPS_API_KEY não configurada no backend");
  }

  const merged = [...localFallback, ...googleSuggestions];
  const unique = [];
  const seen = new Set();

  for (const item of merged) {
    const key = normalizeText(item.text);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  const ranked = await rankSuggestionsByPriority(unique, deviceLocation);

  return ranked.slice(0, 8).map((item) => ({
    text: item.text,
    placeId: item.placeId || "",
    type: item.type,
  }));
}

/* =========================
   HEALTH
========================= */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/* =========================
   FAVORITOS / RECENTES
========================= */
app.get("/api/navigation/quick-access", (_req, res) => {
  return res.json({
    ok: true,
    favorites: favoriteDestinations,
    recent: recentDestinations,
  });
});

/* =========================
   AUTOCOMPLETE NAVIGATION
========================= */
app.post("/api/navigation/suggest", async (req, res) => {
  try {
    const { input, deviceLocation, sessionToken } = req.body || {};

    const suggestions = await getPlaceAutocompleteSuggestions(
      input,
      deviceLocation,
      sessionToken
    );

    return res.json({
      ok: true,
      suggestions,
    });
  } catch (error) {
    console.error("Erro em /api/navigation/suggest:", error);
    return res.status(500).json({
      ok: false,
      suggestions: [],
      error: "Erro ao buscar sugestões",
    });
  }
});

/* =========================
   CHAT
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, deviceLocation } = req.body || {};
    const normalizedLocation = normalizeLocationPayload(deviceLocation);
    const text = String(message || "").trim();

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    if (isLocationQuestion(text)) {
      if (!normalizedLocation) {
        return res.json({
          ok: true,
          reply: "Para informar onde você está, preciso da localização atual do aparelho.",
        });
      }

      const address = await getAddressFromCoords(
        normalizedLocation.latitude,
        normalizedLocation.longitude
      );

      return res.json({
        ok: true,
        reply: buildLocationReply(address, normalizedLocation),
      });
    }

    if (isCancelNavigationRequest(text)) {
      clearActiveNavigation();

      return res.json({
        ok: true,
        reply: "🛑 Rota cancelada.",
        meta: {
          navigation: {
            active: false,
            destination: null,
          },
        },
      });
    }

    if (isCurrentDestinationRequest(text)) {
      if (!hasActiveNavigation()) {
        return res.json({
          ok: true,
          reply: "Nenhuma rota está ativa no momento.",
        });
      }

      return res.json({
        ok: true,
        reply: `📍 Destino atual: ${activeNavigationContext.destination.name}`,
        meta: {
          navigation: {
            active: true,
            destination: activeNavigationContext.destination,
          },
        },
      });
    }

    if (isEtaRequest(text)) {
      if (!hasActiveNavigation()) {
        return res.json({
          ok: true,
          reply: "Nenhuma rota está ativa no momento.",
        });
      }

      const info = buildDistanceEtaReply(
        normalizedLocation,
        activeNavigationContext.destination
      );

      return res.json({
        ok: true,
        reply: info.reply,
        meta: {
          navigation: {
            active: true,
            destination: activeNavigationContext.destination,
          },
          trip: {
            distance: info.distance,
            eta: info.eta,
          },
        },
      });
    }

    if (isTrafficToDestinationRequest(text)) {
      if (!hasActiveNavigation()) {
        return res.json({
          ok: true,
          reply: "Nenhuma rota está ativa no momento.",
        });
      }

      const info = buildDistanceEtaReply(
        normalizedLocation,
        activeNavigationContext.destination
      );

      return res.json({
        ok: true,
        reply:
          `🚦 Trânsito estimado até ${activeNavigationContext.destination.name}:\n` +
          `Distância aproximada: ${info.distance}\n` +
          `Tempo estimado: ${info.eta}`,
        meta: {
          navigation: {
            active: true,
            destination: activeNavigationContext.destination,
          },
          trip: {
            distance: info.distance,
            eta: info.eta,
          },
        },
      });
    }

    const favoriteByMessage = findFavoriteDestinationByMessage(text);
    if (favoriteByMessage) {
      const destination = await geocodeDestination(favoriteByMessage.address);

      if (destination) {
        addRecentDestination(destination);
        setActiveNavigation(destination);

        return res.json({
          ok: true,
          reply: `🏠 Iniciando navegação para ${destination.name}`,
          meta: {
            navigation: {
              active: true,
              destination,
            },
          },
        });
      }
    }

    const nav = detectNavigationIntent(text);

    if (nav.isNavigationRequest) {
      const destination = await geocodeDestination(nav.destinationText);

      if (destination) {
        addRecentDestination(destination);
        setActiveNavigation(destination);

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

    if (isWeatherRequest(text)) {
      if (!normalizedLocation) {
        return res.json({
          ok: true,
          reply: "Para informar o clima, preciso da localização atual do aparelho.",
        });
      }

      const weather = await getWeatherFromCoords(
        normalizedLocation.latitude,
        normalizedLocation.longitude
      );

      if (weather) {
        return res.json({
          ok: true,
          reply: buildWeatherReply(weather),
        });
      }

      return res.json({
        ok: true,
        reply: "Não consegui acessar o clima agora. Tente novamente em instantes.",
      });
    }

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: text,
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
   ROTAS PROFISSIONAIS
========================= */
app.use("/api/driving/radar", drivingRouter);
app.use("/api/navigation", navigationRouter);

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log("🚀 Megan OS rodando na porta", PORT);
});