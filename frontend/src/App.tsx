import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import DrivingMode from "./components/DrivingMode";
import {
  checkHealth,
  sendChatMessage,
  suggestNavigation,
  getNavigationQuickAccess,
  resolveNavigationDestination,
} from "./services/api";
import { resolveDestinationWithGoogleMaps } from "./services/googleMaps.client";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Step = {
  instruction: string;
  end_location: { lat: number; lng: number };
  distanceText?: string;
  distanceMeters?: number;
  maneuver?: string;
};

type RouteSummary = {
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  trafficDurationText?: string;
  trafficDurationSeconds?: number;
  destinationLabel?: string;
};

type NavigationSuggestion = {
  text: string;
  query?: string;
  placeId?: string;
  type?: "favorite" | "recent" | "google";
};

type QuickAccessItem = {
  id?: string;
  label?: string;
  address?: string;
  name?: string;
};

type NavigationContext = {
  placeId?: string;
  query?: string;
  displayText?: string;
};

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
};

type Destination = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  formattedAddress?: string;
  source?: string;
  placeId?: string;
  locationType?: string;
  partialMatch?: boolean;
} | null;

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function looksLikeNavigationInput(value: string) {
  const text = normalizeText(value);

  if (!text) return false;

  const hasNavigationPrefix =
    text.startsWith("navegar") ||
    text.startsWith("ir para") ||
    text.startsWith("ir pra") ||
    text.startsWith("rota") ||
    text.startsWith("me leve") ||
    text.startsWith("levar para") ||
    text.startsWith("quero ir para");

  const hasAddressPattern =
    text.includes("rua ") ||
    text.includes("avenida ") ||
    text.includes("av ") ||
    text.includes("estrada ") ||
    text.includes("rodovia ") ||
    text.includes("travessa ") ||
    text.includes("alameda ") ||
    text.includes("praca ") ||
    text.includes("praça ") ||
    text.includes("bairro ") ||
    text.includes("centro ") ||
    /\b\d{1,6}\b/.test(text);

  const hasPlacePattern =
    text.includes("shopping") ||
    text.includes("mercado") ||
    text.includes("supermercado") ||
    text.includes("farmacia") ||
    text.includes("farmácia") ||
    text.includes("hospital") ||
    text.includes("posto") ||
    text.includes("aeroporto") ||
    text.includes("rodoviaria") ||
    text.includes("rodoviária") ||
    text.includes("estacao") ||
    text.includes("estação") ||
    text.includes("igreja") ||
    text.includes("escola") ||
    text.includes("faculdade");

  return hasNavigationPrefix || hasAddressPattern || hasPlacePattern || text.includes(",");
}

function isCancelNavigationCommand(value: string) {
  const text = normalizeText(value);

  return (
    text === "cancelar navegacao" ||
    text === "encerrar navegacao" ||
    text === "parar navegacao" ||
    text === "fechar rota" ||
    text === "cancelar rota" ||
    text === "encerrar rota" ||
    text === "parar rota"
  );
}

function generateSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getSpeedKmh(speed?: number | null) {
  if (typeof speed !== "number" || Number.isNaN(speed)) return 0;
  return Math.max(0, speed * 3.6);
}

function isValidCoordinate(value: number) {
  return typeof value === "number" && Number.isFinite(value);
}

function isReasonableLocation(loc: DeviceLocation) {
  return (
    isValidCoordinate(loc.latitude) &&
    isValidCoordinate(loc.longitude) &&
    Math.abs(loc.latitude) <= 90 &&
    Math.abs(loc.longitude) <= 180
  );
}

function shouldAcceptLocationUpdate(
  previous: DeviceLocation | null,
  next: DeviceLocation,
  timeDiffMs: number
) {
  if (!isReasonableLocation(next)) return false;

  const nextAccuracy =
    typeof next.accuracy === "number" && !Number.isNaN(next.accuracy)
      ? next.accuracy
      : 9999;

  if (nextAccuracy > 120) {
    return false;
  }

  if (!previous) {
    return true;
  }

  const prevAccuracy =
    typeof previous.accuracy === "number" && !Number.isNaN(previous.accuracy)
      ? previous.accuracy
      : 9999;

  const distance = calculateDistanceMeters(
    previous.latitude,
    previous.longitude,
    next.latitude,
    next.longitude
  );

  const nextSpeedKmh = getSpeedKmh(next.speed);
  const prevSpeedKmh = getSpeedKmh(previous.speed);

  const effectiveTimeSec = Math.max(1, timeDiffMs / 1000);
  const impliedSpeedKmh = (distance / effectiveTimeSec) * 3.6;

  if (distance < 2 && nextAccuracy >= prevAccuracy - 3) {
    return false;
  }

  if (impliedSpeedKmh > 220 && nextSpeedKmh < 130) {
    return false;
  }

  if (distance > 60 && nextAccuracy > prevAccuracy + 20 && nextSpeedKmh < 15) {
    return false;
  }

  if (nextAccuracy + 8 < prevAccuracy) {
    return true;
  }

  if (distance >= 4) {
    return true;
  }

  if (nextSpeedKmh >= 8 && prevSpeedKmh < 8) {
    return true;
  }

  if (Math.abs(nextSpeedKmh - prevSpeedKmh) >= 10) {
    return true;
  }

  return false;
}

function formatTimeAgo(timestamp: number | null) {
  if (!timestamp) return "sem atualização";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h atrás`;
}

export default function App() {
  const [isMobile, setIsMobile] = useState(false);
  const [status, setStatus] = useState("Conectando...");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [destination, setDestination] = useState<Destination>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [navigationActive, setNavigationActive] = useState(false);
  const [showNavigationMap, setShowNavigationMap] = useState(false);
  const [suggestions, setSuggestions] = useState<NavigationSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [favorites, setFavorites] = useState<QuickAccessItem[]>([]);
  const [recent, setRecent] = useState<QuickAccessItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const [lastGpsUpdateAt, setLastGpsUpdateAt] = useState<number | null>(null);
  const [gpsFreezeWarning, setGpsFreezeWarning] = useState("");
  const [gpsStatusText, setGpsStatusText] = useState("Aguardando GPS...");
  const [debugGpsOpen, setDebugGpsOpen] = useState(true);
  const [isRefreshingGps, setIsRefreshingGps] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const sessionTokenRef = useRef(generateSessionToken());
  const lastAcceptedLocationRef = useRef<DeviceLocation | null>(null);
  const lastAcceptedAtRef = useRef(0);
  const stagnantSinceRef = useRef<number | null>(null);
  const gpsRefreshIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeDestinationLabel = useMemo(() => {
    if (!destination) return "";
    return (
      destination.name ||
      destination.formattedAddress ||
      destination.address ||
      "Destino"
    );
  }, [destination]);

  const gpsDebugInfo = useMemo(() => {
    if (!deviceLocation) {
      return {
        latitude: "--",
        longitude: "--",
        accuracy: "--",
        speedKmh: "--",
      };
    }

    return {
      latitude: deviceLocation.latitude.toFixed(6),
      longitude: deviceLocation.longitude.toFixed(6),
      accuracy:
        typeof deviceLocation.accuracy === "number"
          ? `${Math.round(deviceLocation.accuracy)} m`
          : "--",
      speedKmh: `${Math.round(getSpeedKmh(deviceLocation.speed))} km/h`,
    };
  }, [deviceLocation]);

  function applyGpsLocation(nextLoc: DeviceLocation, force = false) {
    if (!nextLoc || !isReasonableLocation(nextLoc)) return;

    const now = Date.now();
    const previous = lastAcceptedLocationRef.current;
    const timeDiffMs = previous ? now - lastAcceptedAtRef.current : 0;

    if (!force && !shouldAcceptLocationUpdate(previous, nextLoc, timeDiffMs)) {
      return;
    }

    if (previous) {
      const movedMeters = calculateDistanceMeters(
        previous.latitude,
        previous.longitude,
        nextLoc.latitude,
        nextLoc.longitude
      );

      if (movedMeters < 3) {
        if (!stagnantSinceRef.current) {
          stagnantSinceRef.current = now;
        } else {
          const stagnantSeconds = Math.round((now - stagnantSinceRef.current) / 1000);
          if (stagnantSeconds >= 15 && navigationActive) {
            setGpsFreezeWarning(
              "A posição atual não mudou nos últimos segundos. Isso pode ser GPS congelado."
            );
          }
        }
      } else {
        stagnantSinceRef.current = null;
        setGpsFreezeWarning("");
      }
    }

    lastAcceptedLocationRef.current = nextLoc;
    lastAcceptedAtRef.current = now;
    setDeviceLocation(nextLoc);
    setLastGpsUpdateAt(now);

    const accuracy =
      typeof nextLoc.accuracy === "number" ? nextLoc.accuracy : null;

    if (accuracy !== null && accuracy > 80) {
      setGpsFreezeWarning(
        "Precisão do GPS está ruim. Tente usar local aberto ou ativar localização precisa."
      );
    } else if (!stagnantSinceRef.current) {
      setGpsFreezeWarning("");
    }
  }

  function forceRefreshGps() {
    if (!navigator.geolocation) {
      setGpsFreezeWarning("Geolocalização não suportada neste aparelho.");
      return;
    }

    setIsRefreshingGps(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: DeviceLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
          speed: typeof pos.coords.speed === "number" ? pos.coords.speed : null,
        };

        if (isReasonableLocation(loc)) {
          applyGpsLocation(loc, true);
          setGpsStatusText("GPS atualizado manualmente");
        } else {
          setGpsFreezeWarning("O GPS retornou uma posição inválida.");
        }

        setIsRefreshingGps(false);
      },
      () => {
        setGpsFreezeWarning("Falha ao atualizar GPS manualmente.");
        setGpsStatusText("Erro ao atualizar GPS");
        setIsRefreshingGps(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    checkHealth()
      .then(() => setStatus("Online"))
      .catch(() => setStatus("Offline"));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  useEffect(() => {
    async function loadQuickAccess() {
      try {
        const res = await getNavigationQuickAccess();
        setFavorites(Array.isArray(res?.favorites) ? res.favorites : []);
        setRecent(Array.isArray(res?.recent) ? res.recent : []);
      } catch {
        setFavorites([]);
        setRecent([]);
      }
    }

    void loadQuickAccess();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!lastGpsUpdateAt) {
        setGpsStatusText("Aguardando GPS...");
        return;
      }

      const seconds = Math.round((Date.now() - lastGpsUpdateAt) / 1000);

      if (seconds <= 5) {
        setGpsStatusText("GPS em tempo real");
      } else if (seconds <= 15) {
        setGpsStatusText("GPS atualizando devagar");
      } else {
        setGpsStatusText("GPS possivelmente congelado");
      }

      if (navigationActive && seconds > 15) {
        setGpsFreezeWarning(
          "A localização do aparelho parece parada ou atrasada. Verifique o GPS do celular."
        );
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [lastGpsUpdateAt, navigationActive]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatusText("Geolocalização não suportada");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: DeviceLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
          speed: typeof pos.coords.speed === "number" ? pos.coords.speed : null,
        };

        if (isReasonableLocation(loc)) {
          applyGpsLocation(loc, true);
        }
      },
      () => {
        setGpsStatusText("Erro ao obter GPS inicial");
        setGpsFreezeWarning(
          "Não foi possível obter a localização inicial do aparelho."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: DeviceLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
          speed: typeof pos.coords.speed === "number" ? pos.coords.speed : null,
        };

        applyGpsLocation(loc, false);
      },
      () => {
        setGpsStatusText("Erro no watchPosition");
        setGpsFreezeWarning(
          "O navegador não está entregando atualizações confiáveis de GPS."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (gpsRefreshIntervalRef.current) {
      window.clearInterval(gpsRefreshIntervalRef.current);
      gpsRefreshIntervalRef.current = null;
    }

    if (!navigationActive) return;

    gpsRefreshIntervalRef.current = window.setInterval(() => {
      const staleSeconds = lastGpsUpdateAt
        ? Math.round((Date.now() - lastGpsUpdateAt) / 1000)
        : 999;

      if (staleSeconds >= 8 && !isRefreshingGps) {
        forceRefreshGps();
      }
    }, 8000);

    return () => {
      if (gpsRefreshIntervalRef.current) {
        window.clearInterval(gpsRefreshIntervalRef.current);
        gpsRefreshIntervalRef.current = null;
      }
    };
  }, [navigationActive, lastGpsUpdateAt, isRefreshingGps]);

  useEffect(() => {
    const trimmed = input.trim();

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (trimmed.length < 2 || !looksLikeNavigationInput(trimmed)) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      try {
        setIsSuggesting(true);

        const res = await suggestNavigation(
          trimmed,
          deviceLocation,
          sessionTokenRef.current
        );

        setSuggestions(Array.isArray(res?.suggestions) ? res.suggestions : []);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSuggesting(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [input, deviceLocation]);

  async function refreshQuickAccess() {
    try {
      const res = await getNavigationQuickAccess();
      setFavorites(Array.isArray(res?.favorites) ? res.favorites : []);
      setRecent(Array.isArray(res?.recent) ? res.recent : []);
    } catch {
      setFavorites([]);
      setRecent([]);
    }
  }

  function abrirTelaNavegacao() {
    if (!navigationActive || !deviceLocation) return;
    setShowNavigationMap(true);
    setRecenterSignal((prev) => prev + 1);
  }

  function voltarAoChat() {
    setShowNavigationMap(false);
  }

  function cancelarNavegacao() {
    setNavigationActive(false);
    setShowNavigationMap(false);
    setDestination(null);
    setSteps([]);
    setRouteSummary(null);
    setRecenterSignal(0);
    setMapInstanceKey((prev) => prev + 1);
  }

  async function handleSend(
    messageOverride?: string,
    navigationContext?: NavigationContext
  ) {
    const trimmed = String(messageOverride ?? input).trim();
    if (!trimmed || isSending) return;

    const displayMessage = navigationContext?.displayText || trimmed;
    const resolutionInput = navigationContext?.query || trimmed;
    const isNavigationRequest =
      looksLikeNavigationInput(resolutionInput) ||
      Boolean(navigationContext?.placeId) ||
      navigationActive;

    setSuggestions([]);
    setIsSuggesting(false);
    setMessages((prev) => [...prev, { role: "user", content: displayMessage }]);
    setInput("");
    setIsSending(true);

    if (isCancelNavigationCommand(resolutionInput)) {
      if (navigationActive) {
        cancelarNavegacao();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Navegação cancelada com sucesso.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Não há navegação ativa no momento.",
          },
        ]);
      }

      setIsSending(false);
      sessionTokenRef.current = generateSessionToken();
      return;
    }

    try {
      let navigationPayload:
        | {
            placeId?: string;
            destination?: NonNullable<Destination>;
          }
        | null = null;

      let resolvedDestination: NonNullable<Destination> | null = null;

      if (isNavigationRequest) {
        try {
          const resolved = await resolveNavigationDestination(
            resolutionInput,
            deviceLocation,
            navigationContext?.placeId
          );

          if (resolved?.destination) {
            resolvedDestination = {
              ...resolved.destination,
              latitude: Number(resolved.destination.latitude),
              longitude: Number(resolved.destination.longitude),
            };

            navigationPayload = {
              placeId: navigationContext?.placeId || resolvedDestination.placeId,
              destination: resolvedDestination,
            };
          }
        } catch {
          try {
            const fallbackDestination = await resolveDestinationWithGoogleMaps(
              resolutionInput,
              deviceLocation,
              navigationContext?.placeId
            );

            if (fallbackDestination) {
              resolvedDestination = {
                ...fallbackDestination,
                latitude: Number(fallbackDestination.latitude),
                longitude: Number(fallbackDestination.longitude),
              };

              navigationPayload = {
                placeId:
                  navigationContext?.placeId || fallbackDestination.placeId || "",
                destination: resolvedDestination,
              };
            }
          } catch {}
        }
      }

      const res = await sendChatMessage(
        resolutionInput,
        deviceLocation,
        navigationPayload
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            resolvedDestination && isNavigationRequest
              ? `Iniciando navegação para ${
                  resolvedDestination.formattedAddress ||
                  resolvedDestination.address ||
                  resolvedDestination.name ||
                  displayMessage
                }`
              : res?.reply || "Mensagem recebida.",
        },
      ]);

      if (
        resolvedDestination ||
        (res?.meta?.navigation?.active && res?.meta?.navigation?.destination)
      ) {
        const nextDestinationRaw =
          (resolvedDestination as Destination) ||
          (res.meta.navigation.destination as Destination);

        const nextDestination = nextDestinationRaw
          ? {
              ...nextDestinationRaw,
              latitude: Number(nextDestinationRaw.latitude),
              longitude: Number(nextDestinationRaw.longitude),
            }
          : null;

        setNavigationActive(false);
        setShowNavigationMap(false);
        setDestination(null);
        setSteps([]);
        setRouteSummary(null);
        setMapInstanceKey((prev) => prev + 1);

        window.setTimeout(() => {
          setDestination(nextDestination);
          setNavigationActive(true);
          setShowNavigationMap(true);
          setRecenterSignal((prev) => prev + 1);
          setMapInstanceKey((prev) => prev + 1);
        }, 80);

        await refreshQuickAccess();
      }

      if (res?.meta?.navigation?.active === false && !resolvedDestination) {
        cancelarNavegacao();
      }

      sessionTokenRef.current = generateSessionToken();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erro ao processar sua solicitação.",
        },
      ]);
    } finally {
      setIsSending(false);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }

  function handleSuggestionSelect(suggestion: NavigationSuggestion) {
    setInput(suggestion.text);
    setSuggestions([]);
    void handleSend(suggestion.query || suggestion.text, {
      placeId: suggestion.placeId,
      query: suggestion.query || suggestion.text,
      displayText: suggestion.text,
    });
  }

  function handleQuickAccessClick(item: QuickAccessItem) {
    const text = item.address || item.name || item.label || "";
    if (!text) return;

    const displayText = item.label || item.name || text;
    setInput(displayText);

    void handleSend(text, {
      query: text,
      displayText,
    });
  }

  function renderSuggestionBadge(type?: string) {
    if (type === "favorite") return "F";
    if (type === "recent") return "R";
    return "P";
  }

  if (showNavigationMap && navigationActive && deviceLocation) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          position: "relative",
          background: "#111827",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: isMobile ? 10 : 16,
            left: isMobile ? 10 : 16,
            right: isMobile ? 10 : "auto",
            zIndex: 1002,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={voltarAoChat}
            style={{
              width: isMobile ? "100%" : "auto",
              background: "rgba(17,24,39,0.92)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: isMobile ? "12px 14px" : "10px 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Voltar ao chat
          </button>

          <button
            onClick={cancelarNavegacao}
            style={{
              width: isMobile ? "100%" : "auto",
              background: "rgba(127,29,29,0.92)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: isMobile ? "12px 14px" : "10px 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Encerrar navegação
          </button>

          <button
            onClick={() => {
              if (!destination) return;
              const lat = destination.latitude;
              const lng = destination.longitude;
              const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
              window.open(url, "_blank");
            }}
            style={{
              width: isMobile ? "100%" : "auto",
              background: "rgba(16,163,127,0.92)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: isMobile ? "12px 14px" : "10px 14px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Abrir no Waze
          </button>
        </div>

        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            zIndex: 1002,
            width: isMobile ? "calc(100vw - 32px)" : 320,
            maxWidth: "calc(100vw - 32px)",
            background: "rgba(17,24,39,0.92)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14 }}>Debug GPS</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={forceRefreshGps}
                disabled={isRefreshingGps}
                style={{
                  background: isRefreshingGps ? "rgba(75,85,99,0.9)" : "rgba(16,163,127,0.9)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: isRefreshingGps ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                {isRefreshingGps ? "Atualizando..." : "Atualizar GPS"}
              </button>

              <button
                onClick={() => setDebugGpsOpen((prev) => !prev)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {debugGpsOpen ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          {debugGpsOpen && (
            <div style={{ display: "grid", gap: 6, fontSize: 12, lineHeight: 1.4 }}>
              <div>Status: {gpsStatusText}</div>
              <div>Última atualização: {formatTimeAgo(lastGpsUpdateAt)}</div>
              <div>Lat: {gpsDebugInfo.latitude}</div>
              <div>Lng: {gpsDebugInfo.longitude}</div>
              <div>Precisão: {gpsDebugInfo.accuracy}</div>
              <div>Velocidade: {gpsDebugInfo.speedKmh}</div>
              {gpsFreezeWarning ? (
                <div
                  style={{
                    marginTop: 4,
                    background: "rgba(180, 83, 9, 0.90)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    fontWeight: 700,
                  }}
                >
                  {gpsFreezeWarning}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {destination && (
          <div
            style={{
              position: "absolute",
              top: isMobile ? "auto" : 16,
              right: isMobile ? 10 : 16,
              left: isMobile ? 10 : "auto",
              bottom: isMobile ? 10 : "auto",
              zIndex: 1002,
              width: isMobile ? "auto" : 360,
              maxWidth: isMobile ? "none" : "calc(100vw - 32px)",
            }}
          >
            <DrivingMode
              destination={destination}
              steps={steps}
              currentLocation={deviceLocation}
              routeSummary={routeSummary}
            />
          </div>
        )}

        <div style={{ width: "100%", height: "100%" }}>
          <MapView
            key={`map-${mapInstanceKey}-${destination?.latitude ?? "x"}-${destination?.longitude ?? "y"}-${destination?.placeId ?? "none"}`}
            location={deviceLocation}
            destination={destination}
            onStepsUpdate={setSteps}
            onRouteDataUpdate={setRouteSummary}
            recenterSignal={recenterSignal}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: "100vh",
        background: "#343541",
      }}
    >
      {!isMobile && (
        <aside
          style={{
            width: 280,
            background: "#202123",
            padding: 20,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 20,
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Megan OS</h2>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              Status: {status}
            </p>

            <div
              style={{
                marginTop: 18,
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                Localização
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {deviceLocation
                  ? `${deviceLocation.latitude.toFixed(5)}, ${deviceLocation.longitude.toFixed(5)}`
                  : "Obtendo localização..."}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                {gpsStatusText}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Favoritos</h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {favorites.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    Nenhum favorito disponível
                  </div>
                )}

                {favorites.map((item, index) => (
                  <button
                    key={`${item.id || item.label || item.address}-${index}`}
                    onClick={() => handleQuickAccessClick(item)}
                    style={{
                      textAlign: "left",
                      background: "#2a2b32",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {item.label || item.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Recentes</h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recent.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    Nenhum destino recente
                  </div>
                )}

                {recent.map((item, index) => (
                  <button
                    key={`${item.name || item.address}-${index}`}
                    onClick={() => handleQuickAccessClick(item)}
                    style={{
                      textAlign: "left",
                      background: "#2a2b32",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "10px 12px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {item.label || item.name || item.address}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      )}

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            padding: isMobile ? 14 : 18,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            color: "#fff",
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            {navigationActive
              ? `Navegação ativa para ${activeDestinationLabel}`
              : "Chat Megan OS"}
          </div>

          {navigationActive && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={abrirTelaNavegacao}
                style={{
                  background: "#10a37f",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Abrir navegação
              </button>

              <button
                onClick={cancelarNavegacao}
                style={{
                  background: "#7f1d1d",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Encerrar rota
              </button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 14 : 18 }}>
          {messages.map((msg, index) => (
            <div
              key={`${msg.role}-${index}`}
              style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  background: msg.role === "user" ? "#10a37f" : "#444654",
                  color: "#fff",
                  padding: "12px 14px",
                  borderRadius: 14,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div style={{ color: "#d1d5db", fontSize: 14 }}>Megan está processando...</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div
          style={{
            padding: isMobile ? 14 : 18,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "#343541",
          }}
        >
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 12, display: "grid", gap: 8 }}>
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.text}-${index}`}
                  onClick={() => handleSuggestionSelect(suggestion)}
                  style={{
                    textAlign: "left",
                    background: "#40414f",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <strong style={{ marginRight: 8 }}>
                    {renderSuggestionBadge(suggestion.type)}
                  </strong>
                  {suggestion.text}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                isSuggesting ? "Buscando sugestões..." : "Digite sua mensagem ou destino..."
              }
              style={{
                flex: 1,
                background: "#40414f",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "14px 16px",
                outline: "none",
              }}
            />

            <button
              onClick={() => void handleSend()}
              disabled={isSending}
              style={{
                background: isSending ? "#6b7280" : "#10a37f",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "0 18px",
                cursor: isSending ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}