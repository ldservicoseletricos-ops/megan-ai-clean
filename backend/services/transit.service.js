import { env } from "../config/env.js";

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

async function geocodeAddress(address) {
  if (!address) return null;

  if (!env.googleMapsApiKey) {
    return null;
  }

  const url = `${GEOCODING_API_URL}?address=${encodeURIComponent(address)}&key=${env.googleMapsApiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Falha no geocoding Google: ${response.status}`);
  }

  const data = await response.json();
  const result = data?.results?.[0];

  if (!result?.geometry?.location) {
    return null;
  }

  return {
    address: result.formatted_address || address,
    lat: result.geometry.location.lat,
    lon: result.geometry.location.lng,
  };
}

function durationTextToSeconds(durationText = "") {
  const match = String(durationText).match(/^(\d+)s$/);
  if (!match) return null;
  return Number(match[1]);
}

function secondsToHuman(seconds) {
  if (!Number.isFinite(seconds)) return "--";

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes} min`;
}

function metersToHuman(meters) {
  if (!Number.isFinite(meters)) return "--";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function buildRoutingPreference(mode = "DRIVE") {
  if (mode === "DRIVE") return "TRAFFIC_AWARE";
  return "TRAFFIC_UNAWARE";
}

function buildDepartureTimeIso(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

async function computeRoute({
  originLat,
  originLon,
  destinationLat,
  destinationLon,
  travelMode = "DRIVE",
  departureOffsetMinutes = 0,
}) {
  if (!env.googleMapsApiKey) {
    return {
      ok: false,
      error: "GOOGLE_MAPS_API_KEY não configurada.",
    };
  }

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: originLat,
          longitude: originLon,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: destinationLat,
          longitude: destinationLon,
        },
      },
    },
    travelMode,
    routingPreference: buildRoutingPreference(travelMode),
    departureTime: buildDepartureTimeIso(departureOffsetMinutes),
    computeAlternativeRoutes: false,
    languageCode: "pt-BR",
    units: "METRIC",
  };

  const response = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.googleMapsApiKey,
      "X-Goog-FieldMask":
        "routes.duration,routes.staticDuration,routes.distanceMeters,routes.localizedValues",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      error: `Falha Routes API: ${response.status} - ${text}`,
    };
  }

  const data = await response.json();
  const route = data?.routes?.[0];

  if (!route) {
    return {
      ok: false,
      error: "Nenhuma rota encontrada.",
    };
  }

  const durationSeconds = durationTextToSeconds(route.duration);
  const staticDurationSeconds = durationTextToSeconds(route.staticDuration);
  const distanceMeters = route.distanceMeters ?? null;

  return {
    ok: true,
    durationSeconds,
    staticDurationSeconds,
    distanceMeters,
    durationLabel: secondsToHuman(durationSeconds),
    staticDurationLabel: secondsToHuman(staticDurationSeconds),
    distanceLabel: metersToHuman(distanceMeters),
  };
}

function rankDepartureWindows(windows = []) {
  return [...windows]
    .filter((item) => item?.ok)
    .sort((a, b) => {
      const aSec = a.durationSeconds ?? Number.MAX_SAFE_INTEGER;
      const bSec = b.durationSeconds ?? Number.MAX_SAFE_INTEGER;
      return aSec - bSec;
    });
}

export async function getTransitSnapshot({
  origin,
  destination,
  originLat,
  originLon,
  destinationLat,
  destinationLon,
  travelMode = "DRIVE",
} = {}) {
  try {
    let originResolved = null;
    let destinationResolved = null;

    if (originLat && originLon) {
      originResolved = {
        address: origin || "Origem atual",
        lat: Number(originLat),
        lon: Number(originLon),
      };
    } else if (origin) {
      originResolved = await geocodeAddress(origin);
    } else if (env.defaultOriginCity) {
      originResolved = await geocodeAddress(env.defaultOriginCity);
    }

    if (destinationLat && destinationLon) {
      destinationResolved = {
        address: destination || "Destino",
        lat: Number(destinationLat),
        lon: Number(destinationLon),
      };
    } else if (destination) {
      destinationResolved = await geocodeAddress(destination);
    }

    if (!originResolved || !destinationResolved) {
      return {
        ok: false,
        summary: "Não foi possível resolver origem e destino para calcular trânsito.",
      };
    }

    const offsets = [0, 15, 30, 60];
    const windowResults = [];

    for (const offset of offsets) {
      const route = await computeRoute({
        originLat: originResolved.lat,
        originLon: originResolved.lon,
        destinationLat: destinationResolved.lat,
        destinationLon: destinationResolved.lon,
        travelMode,
        departureOffsetMinutes: offset,
      });

      windowResults.push({
        departureInMinutes: offset,
        departureLabel: offset === 0 ? "agora" : `em ${offset} min`,
        ...route,
      });
    }

    const bestWindows = rankDepartureWindows(windowResults);
    const nowRoute = windowResults[0];
    const bestRoute = bestWindows[0] || null;

    return {
      ok: true,
      source: "google-routes",
      origin: originResolved.address,
      destination: destinationResolved.address,
      travelMode,
      current: nowRoute,
      bestDepartureOptions: bestWindows.slice(0, 3),
      summary: nowRoute?.ok
        ? `Agora o trajeto leva cerca de ${nowRoute.durationLabel} por ${nowRoute.distanceLabel}.`
        : "Não foi possível calcular a rota agora.",
      recommendation:
        bestRoute && bestRoute.departureInMinutes > 0
          ? `Melhor saída estimada: ${bestRoute.departureLabel}, com duração aproximada de ${bestRoute.durationLabel}.`
          : nowRoute?.ok
          ? `O melhor horário estimado é sair agora, com duração de ${nowRoute.durationLabel}.`
          : "Sem recomendação disponível no momento.",
      premiumCard: {
        title: "Trânsito",
        origin: originResolved.address,
        destination: destinationResolved.address,
        travelMode,
        current: nowRoute,
        bestDepartureOptions: bestWindows.slice(0, 3),
      },
    };
  } catch (error) {
    return {
      ok: false,
      summary: "Falha ao consultar trânsito.",
      error: error.message || "Erro desconhecido",
    };
  }
}