import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import {
  addRecentDestination,
  clearActiveNavigation,
  favoriteDestinations,
  findFavoriteDestinationByMessage,
  getActiveNavigation,
  hasActiveNavigation,
  setActiveNavigation,
} from "../services/chat-state.service.js";

const ai = env.geminiApiKey
  ? new GoogleGenAI({ apiKey: env.geminiApiKey })
  : null;

const destinationCache = new Map();
const sessions = [];

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

function isCancelNavigationRequest(message) {
  const text = normalizeText(message);

  const commands = [
    "cancelar",
    "parar",
    "encerrar",
    "fechar",
    "terminar",
  ];

  const keywords = [
    "rota",
    "navegacao",
    "navegação",
    "trajeto",
    "direcao",
    "direção",
  ];

  const hasCommand = commands.some((cmd) => text.includes(cmd));
  const hasKeyword = keywords.some((key) => text.includes(key));

  return hasCommand && hasKeyword;
}

function cleanDestinationText(text) {
  return String(text || "")
    .replace(/^navegar para\s+/i, "")
    .replace(/^ir para\s+/i, "")
    .replace(/^rota para\s+/i, "")
    .trim();
}

function detectNavigationIntent(message) {
  const text = normalizeText(message);

  const isExplicitCommand =
    text.startsWith("navegar") ||
    text.startsWith("ir para") ||
    text.startsWith("rota");

  const looksLikeAddress =
    text.includes("rua") ||
    text.includes("avenida") ||
    text.includes("av") ||
    text.includes("estrada") ||
    text.includes("rodovia") ||
    text.includes("praça") ||
    text.includes("praca") ||
    text.includes("centro") ||
    text.includes("bairro") ||
    text.includes("shopping");

  if (isExplicitCommand || looksLikeAddress) {
    return {
      isNavigationRequest: true,
      destinationText: cleanDestinationText(message),
    };
  }

  return { isNavigationRequest: false, destinationText: "" };
}

function normalizeLocationPayload(deviceLocation) {
  if (!deviceLocation) return null;

  const lat = Number(deviceLocation.latitude);
  const lng = Number(deviceLocation.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { latitude: lat, longitude: lng };
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
      reply: "Preciso da localização atual.",
    };
  }

  const distanceKm = calculateDistanceKm(
    deviceLocation.latitude,
    deviceLocation.longitude,
    destination.latitude,
    destination.longitude
  );

  const distance = `${distanceKm.toFixed(2)} km`;
  const eta = `${Math.round((distanceKm / 40) * 60)} min`;

  return {
    distance,
    eta,
    reply: `Distância: ${distance} • Tempo: ${eta}`,
  };
}

function pushSessionMessage(role, content) {
  sessions.push({
    role,
    content,
    createdAt: new Date().toISOString(),
  });

  if (sessions.length > 200) {
    sessions.shift();
  }
}

/* =========================
   CONTROLLER
========================= */

export async function chatController(req, res) {
  try {
    const { message, deviceLocation } = req.body || {};
    const text = String(message || "").trim();
    const location = normalizeLocationPayload(deviceLocation);

    if (!text) {
      return res.status(400).json({ ok: false, error: "Mensagem obrigatória" });
    }

    pushSessionMessage("user", text);

    /* =========================
       CANCELAR NAVEGAÇÃO
    ========================= */

    if (isCancelNavigationRequest(text)) {
      clearActiveNavigation();

      const reply = "🛑 Navegação cancelada.";
      pushSessionMessage("assistant", reply);

      return res.json({
        ok: true,
        reply,
        meta: {
          navigation: {
            active: false,
            destination: null,
          },
        },
      });
    }

    /* =========================
       DESTINO ATUAL
    ========================= */

    if (hasActiveNavigation()) {
      const current = getActiveNavigation();

      if (normalizeText(text).includes("destino")) {
        const reply = `Destino atual: ${current.destination.name}`;
        return res.json({
          ok: true,
          reply,
          meta: {
            navigation: {
              active: true,
              destination: current.destination,
            },
          },
        });
      }

      if (normalizeText(text).includes("quanto falta")) {
        const info = buildDistanceEtaReply(location, current.destination);

        return res.json({
          ok: true,
          reply: info.reply,
          meta: {
            navigation: {
              active: true,
              destination: current.destination,
            },
          },
        });
      }
    }

    /* =========================
       NOVA NAVEGAÇÃO
    ========================= */

    const nav = detectNavigationIntent(text);

    if (nav.isNavigationRequest) {
      const destination = {
        latitude: -23.5505,
        longitude: -46.6333,
        name: nav.destinationText || "Destino",
      };

      setActiveNavigation(destination);
      addRecentDestination(destination);

      const reply = `🚗 Iniciando navegação para ${destination.name}`;

      return res.json({
        ok: true,
        reply,
        meta: {
          navigation: {
            active: true,
            destination,
          },
        },
      });
    }

    /* =========================
       IA NORMAL
    ========================= */

    if (ai) {
      const response = await ai.models.generateContent({
        model: env.geminiModel,
        contents: text,
      });

      const reply =
        response?.text ||
        response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Mensagem recebida";

      pushSessionMessage("assistant", reply);

      return res.json({ ok: true, reply });
    }

    return res.json({ ok: true, reply: "Mensagem recebida." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "Erro no chat" });
  }
}