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

  const hasCommand =
    text.includes("cancelar") ||
    text.includes("parar") ||
    text.includes("encerrar") ||
    text.includes("fechar");

  const hasNavigationWord =
    text.includes("rota") ||
    text.includes("navegacao") ||
    text.includes("navegação") ||
    text.includes("trajeto");

  return hasCommand && hasNavigationWord;
}

function cleanDestinationText(text) {
  return String(text || "")
    .replace(/^navegar para\s+/i, "")
    .replace(/^navegar pra\s+/i, "")
    .replace(/^ir para\s+/i, "")
    .replace(/^ir pra\s+/i, "")
    .replace(/^rota para\s+/i, "")
    .replace(/^rota pra\s+/i, "")
    .replace(/^me leve para\s+/i, "")
    .replace(/^levar para\s+/i, "")
    .trim();
}

function detectNavigationIntent(message) {
  const text = normalizeText(message);

  const isCommand =
    text.startsWith("navegar") ||
    text.startsWith("ir para") ||
    text.startsWith("ir pra") ||
    text.startsWith("rota") ||
    text.startsWith("me leve") ||
    text.startsWith("levar para");

  const looksLikePlace =
    text.includes("rua") ||
    text.includes("avenida") ||
    text.includes("av ") ||
    text.includes("estrada") ||
    text.includes("rodovia") ||
    text.includes("shopping") ||
    text.includes("centro") ||
    text.includes("bairro") ||
    text.includes("hospital") ||
    text.includes("mercado") ||
    text.includes("farmacia") ||
    text.includes("farmácia") ||
    /\b\d{1,6}\b/.test(text);

  return {
    isNavigationRequest: isCommand || looksLikePlace,
    destinationText: cleanDestinationText(message),
  };
}

function normalizeLocation(deviceLocation) {
  if (!deviceLocation) return null;

  const lat = Number(deviceLocation.latitude);
  const lng = Number(deviceLocation.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

function hasValidCoordinates(destination) {
  if (!destination) return false;

  const lat = Number(destination.latitude);
  const lng = Number(destination.longitude);

  return Number.isFinite(lat) && Number.isFinite(lng);
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
  if (!deviceLocation || !destination || !hasValidCoordinates(destination)) {
    return {
      distance: "--",
      eta: "--",
      reply: "Preciso da localização atual e de um destino válido.",
    };
  }

  const distanceKm = calculateDistanceKm(
    Number(deviceLocation.latitude),
    Number(deviceLocation.longitude),
    Number(destination.latitude),
    Number(destination.longitude)
  );

  const distance = `${distanceKm.toFixed(2)} km`;
  const eta = `${Math.max(1, Math.round((distanceKm / 40) * 60))} min`;

  return {
    distance,
    eta,
    reply: `Distância: ${distance} • Tempo: ${eta}`,
  };
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

    if (hasActiveNavigation()) {
      const current = getActiveNavigation();

      if (normalizeText(text).includes("destino")) {
        return res.json({
          ok: true,
          reply: `Destino atual: ${current.destination.name || "Destino"}`,
          meta: {
            navigation: {
              active: true,
              destination: current.destination,
            },
          },
        });
      }

      if (
        normalizeText(text).includes("quanto falta") ||
        normalizeText(text).includes("tempo restante") ||
        normalizeText(text).includes("distancia")
      ) {
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

    const nav = detectNavigationIntent(text);

    if (
      nav.isNavigationRequest ||
      navigationPayload?.destination ||
      navigationPayload?.placeId
    ) {
      let destination = null;

      if (navigationPayload?.destination && hasValidCoordinates(navigationPayload.destination)) {
        destination = {
          latitude: Number(navigationPayload.destination.latitude),
          longitude: Number(navigationPayload.destination.longitude),
          name:
            navigationPayload.destination.formattedAddress ||
            navigationPayload.destination.address ||
            navigationPayload.destination.name ||
            "Destino",
          address: navigationPayload.destination.address || "",
          formattedAddress:
            navigationPayload.destination.formattedAddress || "",
          placeId: navigationPayload.destination.placeId || "",
          source: navigationPayload.destination.source || "frontend",
        };
      }

      if (!destination) {
        return res.json({
          ok: true,
          reply:
            "Entendi o destino, mas ainda não consegui localizar esse endereço com precisão. Envie o endereço mais completo com rua, número, cidade e estado.",
          meta: {
            navigation: {
              active: false,
              destination: null,
            },
          },
        });
      }

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