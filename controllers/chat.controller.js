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
    61: "chuva leve",
    63: "chuva moderada",
    65: "chuva forte",
    80: "pancadas de chuva leves",
    81: "pancadas de chuva moderadas",
    82: "pancadas de chuva fortes",
    95: "trovoadas",
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
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const current = data?.current;
    if (!current) return null;

    return {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      windSpeed: current.wind_speed_10m,
      humidity: current.relative_humidity_2m,
      weatherCode: current.weather_code,
      weatherText: weatherCodeToText(current.weather_code),
    };
  } catch {
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
  if (!env.googleMapsApiKey) {
    return null;
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(env.googleMapsApiKey)}` +
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
    } catch {
      // ignora e tenta próximo candidato
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

function pushSessionMessage(role, content) {
  sessions.push({
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  });

  if (sessions.length > 200) {
    sessions.splice(0, sessions.length - 200);
  }
}

export async function chatController(req, res) {
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

    pushSessionMessage("user", text);

    if (isCancelNavigationRequest(text)) {
      clearActiveNavigation();

      const reply = "🛑 Rota cancelada.";
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

    if (isCurrentDestinationRequest(text)) {
      if (!hasActiveNavigation()) {
        const reply = "Nenhuma rota está ativa no momento.";
        pushSessionMessage("assistant", reply);
        return res.json({ ok: true, reply });
      }

      const current = getActiveNavigation();
      const reply = `📍 Destino atual: ${current.destination.name}`;
      pushSessionMessage("assistant", reply);

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

    if (isEtaRequest(text)) {
      if (!hasActiveNavigation()) {
        const reply = "Nenhuma rota está ativa no momento.";
        pushSessionMessage("assistant", reply);
        return res.json({ ok: true, reply });
      }

      const current = getActiveNavigation();
      const info = buildDistanceEtaReply(normalizedLocation, current.destination);
      pushSessionMessage("assistant", info.reply);

      return res.json({
        ok: true,
        reply: info.reply,
        meta: {
          navigation: {
            active: true,
            destination: current.destination,
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
        const reply = "Nenhuma rota está ativa no momento.";
        pushSessionMessage("assistant", reply);
        return res.json({ ok: true, reply });
      }

      const current = getActiveNavigation();
      const info = buildDistanceEtaReply(normalizedLocation, current.destination);
      const reply =
        `🚦 Trânsito estimado até ${current.destination.name}:\n` +
        `Distância aproximada: ${info.distance}\n` +
        `Tempo estimado: ${info.eta}`;

      pushSessionMessage("assistant", reply);

      return res.json({
        ok: true,
        reply,
        meta: {
          navigation: {
            active: true,
            destination: current.destination,
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

        const reply = `🏠 Iniciando navegação para ${destination.name}`;
        pushSessionMessage("assistant", reply);

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
    }

    const nav = detectNavigationIntent(text);
    if (nav.isNavigationRequest) {
      const destination = await geocodeDestination(nav.destinationText);

      if (destination) {
        addRecentDestination(destination);
        setActiveNavigation(destination);

        const reply = `🚗 Iniciando navegação para ${destination.name}`;
        pushSessionMessage("assistant", reply);

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

      const reply = `Entendi o destino "${nav.destinationText}", mas não consegui localizar esse lugar com precisão. Tente enviar o nome com cidade e estado.`;
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

    if (isWeatherRequest(text)) {
      if (!normalizedLocation) {
        const reply = "Para informar o clima, preciso da localização atual do aparelho.";
        pushSessionMessage("assistant", reply);
        return res.json({ ok: true, reply });
      }

      const weather = await getWeatherFromCoords(
        normalizedLocation.latitude,
        normalizedLocation.longitude
      );

      const reply = weather
        ? buildWeatherReply(weather)
        : "Não consegui acessar o clima agora. Tente novamente em instantes.";

      pushSessionMessage("assistant", reply);
      return res.json({ ok: true, reply });
    }

    if (ai) {
      try {
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
      } catch (error) {
        console.error("Erro Gemini:", error);
      }
    }

    const fallbackReply = "Mensagem recebida";
    pushSessionMessage("assistant", fallbackReply);
    return res.json({ ok: true, reply: fallbackReply });
  } catch (error) {
    console.error("[CHAT ERROR]", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Erro no chat",
    });
  }
}

export async function streamChatController(req, res) {
  const { message, deviceLocation } = req.body || {};

  try {
    const result = await new Promise((resolve, reject) => {
      const mockRes = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          resolve({ statusCode: this.statusCode || 200, payload });
        },
      };

      chatController({ body: { message, deviceLocation } }, mockRes).catch(reject);
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reply = result?.payload?.reply || "Mensagem recebida";
    res.write(`data: ${JSON.stringify({ ok: true, delta: reply })}\n\n`);
    res.write(`data: ${JSON.stringify({ ok: true, done: true, meta: result?.payload?.meta || null })}\n\n`);
    res.end();
  } catch (error) {
    console.error("[STREAM CHAT ERROR]", error?.message || error);
    res.status(500).json({ ok: false, error: "Erro no stream do chat" });
  }
}

export async function listSessionsController(_req, res) {
  return res.json({
    ok: true,
    sessions: [
      {
        id: "default",
        title: "Sessão atual",
        updatedAt: sessions.at(-1)?.createdAt || new Date().toISOString(),
      },
    ],
  });
}

export async function getSessionMessagesController(_req, res) {
  return res.json({
    ok: true,
    messages: sessions,
  });
}

export async function renameSessionController(req, res) {
  const title = String(req.body?.title || "Sessão atual").trim() || "Sessão atual";

  return res.json({
    ok: true,
    session: {
      id: req.params.sessionId || "default",
      title,
      updatedAt: new Date().toISOString(),
    },
  });
}
