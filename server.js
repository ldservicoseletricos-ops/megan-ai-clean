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
  "https://hoppscotch.io",
  env.frontendUrl,
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  // libera origens exatas já conhecidas
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();

    // previews e deploys do projeto Megan na Vercel
    if (
      host === "megan-ai-clean-wnst.vercel.app" ||
      host.endsWith(".vercel.app")
    ) {
      if (host.includes("megan-ai-clean-wnst")) {
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
    const res = await fetch("https://places.googleapis