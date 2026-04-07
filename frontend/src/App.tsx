import MapView from "./components/MapView";
import DrivingMode from "./components/DrivingMode";
import { useEffect, useRef, useState } from "react";
import {
  checkHealth,
  sendChatMessage,
  suggestNavigation,
  getNavigationQuickAccess,
} from "./services/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Step = {
  instruction: string;
  end_location: { lat: number; lng: number };
};

type NavigationSuggestion = {
  text: string;
  placeId?: string;
  type?: "favorite" | "recent" | "google";
};

type QuickAccessItem = {
  id?: string;
  label?: string;
  address?: string;
  name?: string;
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

  return (
    text.startsWith("navegar") ||
    text.startsWith("ir para") ||
    text.startsWith("ir pra") ||
    text.startsWith("rota") ||
    text.includes("rua ") ||
    text.includes("avenida ") ||
    text.includes("av ") ||
    text.includes("estrada ") ||
    text.includes("rodovia ") ||
    text.includes("travessa ") ||
    text.includes("alameda ") ||
    text.includes("praca ") ||
    text.includes("praça ")
  );
}

function isCancelNavigationCommand(value: string) {
  const text = normalizeText(value);

  return (
    text === "cancelar navegação" ||
    text === "cancelar navegacao" ||
    text === "encerrar navegação" ||
    text === "encerrar navegacao" ||
    text === "parar navegação" ||
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

export default function App() {
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);

  const [destination, setDestination] = useState<Destination>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const [navigationActive, setNavigationActive] = useState(false);
  const [showNavigationMap, setShowNavigationMap] = useState(false);

  const [suggestions, setSuggestions] = useState<NavigationSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [favorites, setFavorites] = useState<QuickAccessItem[]>([]);
  const [recent, setRecent] = useState<QuickAccessItem[]>([]);

  const [isMobile, setIsMobile] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const sessionTokenRef = useRef(generateSessionToken());
  const lastAcceptedLocationRef = useRef<DeviceLocation | null>(null);
  const lastAcceptedAtRef = useRef(0);

  useEffect(() => {
    checkHealth().then(() => setStatus("Online")).catch(() => setStatus("Offline"));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function loadQuickAccess() {
      try {
        const res = await getNavigationQuickAccess();
        setFavorites(Array.isArray(res?.favorites) ? res.favorites : []);
        setRecent(Array.isArray(res?.recent) ? res.recent : []);
      } catch (error) {
        console.log("Erro ao carregar favoritos e recentes:", error);
      }
    }

    loadQuickAccess();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.log("Geolocalização não suportada");
      return;
    }

    const acceptLocation = (nextLoc: DeviceLocation, force = false) => {
      const now = Date.now();
      const previous = lastAcceptedLocationRef.current;
      const timeDiffMs = previous ? now - lastAcceptedAtRef.current : 0;

      if (!force && !shouldAcceptLocationUpdate(previous, nextLoc, timeDiffMs)) {
        return;
      }

      lastAcceptedLocationRef.current = nextLoc;
      lastAcceptedAtRef.current = now;
      setDeviceLocation(nextLoc);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: DeviceLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
          speed:
            typeof pos.coords.speed === "number" ? pos.coords.speed : null,
        };

        console.log("LOCALIZAÇÃO INICIAL:", loc);
        if (isReasonableLocation(loc)) {
          acceptLocation(loc, true);
        }
      },
      (error) => {
        console.log("Erro localização inicial:", error);
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
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
          speed:
            typeof pos.coords.speed === "number" ? pos.coords.speed : null,
        };

        console.log("LOCALIZAÇÃO ATUALIZADA:", loc);
        acceptLocation(loc);
      },
      (error) => {
        console.log("Erro geolocalização:", error);
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
      } catch (error) {
        console.log("Erro ao buscar sugestões:", error);
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
    } catch (error) {
      console.log("Erro ao atualizar favoritos e recentes:", error);
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
    setRecenterSignal(0);
  }

  async function handleSend(messageOverride?: string) {
    const trimmed = String(messageOverride ?? input).trim();
    if (!trimmed) return;

    setSuggestions([]);
    setIsSuggesting(false);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    if (isCancelNavigationCommand(trimmed)) {
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
      return;
    }

    try {
      const res = await sendChatMessage(trimmed, deviceLocation);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res?.reply || "Mensagem recebida.",
        },
      ]);

      if (res?.meta?.navigation?.active && res?.meta?.navigation?.destination) {
        const nextDestination = res.meta.navigation.destination as Destination;

        setDestination(nextDestination);
        setSteps([]);
        setNavigationActive(true);
        setShowNavigationMap(true);
        setRecenterSignal((prev) => prev + 1);

        await refreshQuickAccess();
      }

      if (res?.meta?.navigation?.active === false) {
        cancelarNavegacao();
      }

      sessionTokenRef.current = generateSessionToken();
    } catch (error) {
      console.log("Erro ao enviar mensagem:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erro ao processar sua solicitação.",
        },
      ]);
    }
  }

  function handleSuggestionSelect(suggestion: NavigationSuggestion) {
    setInput(suggestion.text);
    setSuggestions([]);
    handleSend(suggestion.text);
  }

  function handleQuickAccessClick(item: QuickAccessItem) {
    const text = item.address || item.name || item.label || "";
    if (!text) return;

    setInput(text);
    handleSend(text);
  }

  function renderSuggestionBadge(type?: string) {
    if (type === "favorite") return "⭐";
    if (type === "recent") return "🕘";
    return "📍";
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
            zIndex: 1002,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            right: isMobile ? 10 : "auto",
          }}
        >
          <button
            onClick={voltarAoChat}
            style={{
              background: "rgba(17,24,39,0.92)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: isMobile ? "12px 14px" : "10px 14px",
              cursor: "pointer",
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              backdropFilter: "blur(8px)",
              fontSize: isMobile ? 14 : 14,
              flex: isMobile ? 1 : "initial",
            }}
          >
            ← Voltar ao chat
          </button>

          <button
            onClick={cancelarNavegacao}
            style={{
              background: "rgba(127,29,29,0.92)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: isMobile ? "12px 14px" : "10px 14px",
              cursor: "pointer",
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              backdropFilter: "blur(8px)",
              fontSize: isMobile ? 14 : 14,
              flex: isMobile ? 1 : "initial",
            }}
          >
            Encerrar navegação
          </button>
        </div>

        {destination && (
          <div
            style={{
              position: "absolute",
              top: isMobile ? "auto" : 16,
              bottom: isMobile ? 10 : "auto",
              right: isMobile ? 10 : 16,
              left: isMobile ? 10 : "auto",
              zIndex: 1002,
              width: isMobile ? "auto" : 360,
              maxWidth: isMobile ? "none" : "calc(100vw - 32px)",
            }}
          >
            <DrivingMode
              destination={destination}
              steps={steps}
              currentLocation={deviceLocation}
            />
          </div>
        )}

        <div style={{ width: "100%", height: "100%" }}>
          <MapView
            location={deviceLocation}
            destination={destination}
            onStepsUpdate={setSteps}
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
            width: 260,
            background: "#202123",
            padding: 20,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div>
            <h2>Megan OS</h2>
            <p style={{ fontSize: 12, opacity: 0.7 }}>Status: {status}</p>

            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Favoritos</h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                    ⭐ {item.label || item.name}
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
                    🕘 {item.name || item.address}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (navigationActive) {
                abrirTelaNavegacao();
              }
            }}
            style={{
              background: navigationActive ? "#10a37f" : "#374151",
              border: "none",
              padding: 12,
              borderRadius: 8,
              color: "#fff",
              cursor: navigationActive ? "pointer" : "not-allowed",
              opacity: navigationActive ? 1 : 0.65,
            }}
          >
            🗺️ {navigationActive ? "Voltar para navegação" : "Sem navegação ativa"}
          </button>
        </aside>
      )}

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          minWidth: 0,
        }}
      >
        {isMobile && (
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #444",
              background: "#202123",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Megan OS</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Status: {status}</div>
            </div>

            {navigationActive && (
              <button
                onClick={abrirTelaNavegacao}
                style={{
                  background: "#10a37f",
                  border: "none",
                  padding: "10px 12px",
                  borderRadius: 10,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                Abrir mapa
              </button>
            )}
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? 12 : 20,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  background: m.role === "user" ? "#10a37f" : "#444654",
                  padding: isMobile ? 10 : 12,
                  borderRadius: 10,
                  maxWidth: isMobile ? "85%" : "60%",
                  color: "#fff",
                  whiteSpace: "pre-wrap",
                  fontSize: isMobile ? 14 : 16,
                  lineHeight: 1.45,
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        {navigationActive && destination && (
          <div
            style={{
              margin: isMobile ? "0 12px 10px 12px" : "0 20px 12px 20px",
              background: "rgba(16,163,127,0.12)",
              border: "1px solid rgba(16,163,127,0.35)",
              color: "#d1fae5",
              borderRadius: 12,
              padding: isMobile ? "10px 12px" : "12px 14px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ fontSize: isMobile ? 13 : 14 }}>
              Navegação ativa{destination?.name ? `: ${destination.name}` : "."}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={abrirTelaNavegacao}
                style={{
                  background: "#10a37f",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  flex: isMobile ? 1 : "initial",
                }}
              >
                Abrir mapa
              </button>

              <button
                onClick={cancelarNavegacao}
                style={{
                  background: "#7f1d1d",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  flex: isMobile ? 1 : "initial",
                }}
              >
                Cancelar navegação
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            padding: isMobile ? 12 : 20,
            borderTop: "1px solid #444",
            position: "relative",
          }}
        >
          {(suggestions.length > 0 || isSuggesting) && (
            <div
              style={{
                position: "absolute",
                left: isMobile ? 12 : 20,
                right: isMobile ? 12 : 20,
                bottom: isMobile ? 78 : 84,
                background: "#1f2937",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                overflow: "hidden",
                zIndex: 20,
                maxHeight: isMobile ? 220 : 320,
                overflowY: "auto",
              }}
            >
              {isSuggesting && suggestions.length === 0 && (
                <div
                  style={{
                    padding: 14,
                    color: "#cbd5e1",
                    fontSize: 14,
                  }}
                >
                  Buscando sugestões...
                </div>
              )}

              {suggestions.map((item, index) => (
                <button
                  key={`${item.text}-${index}`}
                  onClick={() => handleSuggestionSelect(item)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 16px",
                    border: "none",
                    borderBottom:
                      index !== suggestions.length - 1
                        ? "1px solid rgba(255,255,255,0.08)"
                        : "none",
                    background: "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {renderSuggestionBadge(item.type)} {item.text}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Digite uma mensagem ou peça navegação..."
              style={{
                flex: 1,
                padding: isMobile ? 14 : 12,
                borderRadius: 8,
                border: "none",
                outline: "none",
                fontSize: isMobile ? 16 : 14,
                minWidth: 0,
              }}
            />
            <button
              onClick={() => handleSend()}
              style={{
                background: "#10a37f",
                border: "none",
                padding: isMobile ? "0 16px" : "0 20px",
                borderRadius: 8,
                color: "#fff",
                cursor: "pointer",
                fontSize: isMobile ? 15 : 14,
                fontWeight: 700,
                whiteSpace: "nowrap",
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