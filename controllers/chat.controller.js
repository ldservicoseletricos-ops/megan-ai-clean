import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import {
  addRecentDestination,
  clearActiveNavigation,
  getActiveNavigation,
  hasActiveNavigation,
  setActiveNavigation,
} from "../services/chat-state.service.js";

const ai = env.geminiApiKey
  ? new GoogleGenAI({ apiKey: env.geminiApiKey })
  : null;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isCancelNavigationRequest(message) {
  const text = normalizeText(message);

  return (
    text.includes("cancelar") ||
    text.includes("parar") ||
    text.includes("encerrar")
  );
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

  const isCommand =
    text.startsWith("navegar") ||
    text.startsWith("ir para") ||
    text.startsWith("rota");

  const looksLikePlace =
    text.includes("rua") ||
    text.includes("avenida") ||
    text.includes("av") ||
    text.includes("shopping") ||
    text.includes("centro") ||
    text.includes("bairro");

  return {
    isNavigationRequest: isCommand || looksLikePlace,
    destinationText: cleanDestinationText(message),
  };
}

function normalizeLocation(deviceLocation) {
  if (!deviceLocation) return null;

  const lat = Number(deviceLocation.latitude);
  const lng = Number(deviceLocation.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { latitude: lat, longitude: lng };
}

export async function chatController(req, res) {
  try {
    const { message, deviceLocation, navigationPayload } = req.body || {};

    const text = String(message || "").trim();
    const location = normalizeLocation(deviceLocation);

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    /* =========================
       CANCELAR NAVEGAÇÃO
    ========================= */
    if (isCancelNavigationRequest(text)) {
      clearActiveNavigation();

      return res.json({
        ok: true,
        reply: "🛑 Navegação cancelada.",
        meta: {
          navigation: {
            active: false,
            destination: null,
          },
        },
      });
    }

    /* =========================
       NAVEGAÇÃO ATIVA
    ========================= */
    if (hasActiveNavigation()) {
      const current = getActiveNavigation();

      if (normalizeText(text).includes("destino")) {
        return res.json({
          ok: true,
          reply: `Destino atual: ${current.destination.name}`,
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
       DETECTAR NAVEGAÇÃO
    ========================= */
    const nav = detectNavigationIntent(text);

    if (
      nav.isNavigationRequest ||
      navigationPayload?.destination ||
      navigationPayload?.placeId
    ) {
      let destination = null;

      /* 🔥 PRIORIDADE: FRONTEND */
      if (navigationPayload?.destination) {
        destination = {
          latitude: Number(navigationPayload.destination.latitude),
          longitude: Number(navigationPayload.destination.longitude),
          name:
            navigationPayload.destination.formattedAddress ||
            navigationPayload.destination.address ||
            navigationPayload.destination.name ||
            "Destino",
        };
      } else {
        /* 🔥 FORÇA DESTINO MESMO SEM COORDENADA */
        destination = {
          latitude: location?.latitude || -23.73557,
          longitude: location?.longitude || -46.56095,
          name: nav.destinationText || text,
        };
      }

      /* 🔥 ATIVA NAVEGAÇÃO */
      setActiveNavigation(destination);
      addRecentDestination(destination);

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

    /* =========================
       FALLBACK
    ========================= */
    return res.json({
      ok: true,
      reply: "Mensagem recebida.",
    });
  } catch (error) {
    console.error("Erro chatController:", error);

    return res.status(500).json({
      ok: false,
      error: "Erro interno no chat",
    });
  }
}