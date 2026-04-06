import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

import { env } from "./config/env.js";
import chatRouter from "./routes/chat.route.js";
import navigationRouter from "./routes/navigation.route.js";
import drivingRouter from "./routes/driving.route.js";
import {
  favoriteDestinations,
  recentDestinations,
} from "./services/chat-state.service.js";

dotenv.config();

const app = express();
const PORT = env.port || 10000;

/* =========================
   CORS
========================= */

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://megan-ai-clean-wnst.vercel.app",
  "https://megan-ai-clean.vercel.app",
  "https://hoppscotch.io",
  env.frontendUrl,
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();

    // aceita previews/deploys do projeto Megan hospedados na Vercel
    if (host.endsWith(".vercel.app")) {
      const isMeganPreview =
        host.startsWith("megan-ai-clean-") ||
        host.startsWith("megan-ai-clean.") ||
        host === "megan-ai-clean.vercel.app" ||
        host === "megan-ai-clean-wnst.vercel.app";

      if (isMeganPreview) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
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

async function getPlaceAutocompleteSuggestions(input, deviceLocation, sessionToken) {
  const cleanedInput = String(input || "").trim();
  if (cleanedInput.length < 2) return [];

  const normalizedInput = normalizeText(cleanedInput);

  const recent = recentDestinations
    .filter((item) => normalizeText(item.name).includes(normalizedInput))
    .map((item) => ({
      text: item.name,
      placeId: "",
      type: "recent",
    }));

  const favorites = favoriteDestinations
    .filter((item) => {
      return (
        normalizeText(item.label).includes(normalizedInput) ||
        normalizeText(item.address).includes(normalizedInput)
      );
    })
    .map((item) => ({
      text: `${item.label} — ${item.address}`,
      placeId: "",
      type: "favorite",
    }));

  const fallbackOnly = [...favorites, ...recent];

  if (!env.googleMapsApiKey) {
    return fallbackOnly.slice(0, 8);
  }

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
        "X-Goog-Api-Key": env.googleMapsApiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.text.text,suggestions.placePrediction.placeId",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    const googleSuggestions =
      res.ok && Array.isArray(data?.suggestions)
        ? data.suggestions
            .map((item) => {
              const prediction = item?.placePrediction;
              const text = prediction?.text?.text || "";
              const placeId = prediction?.placeId || "";

              if (!text) return null;

              return {
                text,
                placeId,
                type: "google",
              };
            })
            .filter(Boolean)
        : [];

    const merged = [...favorites, ...recent, ...googleSuggestions];
    const unique = [];
    const seen = new Set();

    for (const item of merged) {
      const key = normalizeText(item.text);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    return unique.slice(0, 8);
  } catch (error) {
    console.error("❌ Erro autocomplete Google Places:", error);
    return fallbackOnly.slice(0, 8);
  }
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

/* =========================
   ROUTES
========================= */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/navigation/quick-access", (_req, res) => {
  return res.json({
    ok: true,
    favorites: favoriteDestinations,
    recent: recentDestinations,
  });
});

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

app.use("/api/chat", chatRouter);

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
        !Number.isNaN(currentSpeed) && currentSpeed > 0 ? currentSpeed * 3.6 : 40;

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

app.use("/api/driving/radar", drivingRouter);
app.use("/api/navigation", navigationRouter);

app.listen(PORT, () => {
  console.log("🚀 Megan OS rodando na porta", PORT);
});