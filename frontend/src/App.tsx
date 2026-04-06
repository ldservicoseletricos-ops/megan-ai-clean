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

  if (text.length < 2) return false;

  const blockedTerms = [
    "onde estou",
    "onde eu estou",
    "qual minha localizacao",
    "qual minha localização",
    "minha localizacao",
    "minha localização",
    "clima",
    "tempo",
    "temperatura",
    "vai chover",
    "quem e",
    "quem é",
    "o que e",
    "o que é",
    "oque e",
    "oque é",
  ];

  if (blockedTerms.some((term) => text.includes(normalizeText(term)))) {
    return false;
  }

  if (text.includes("?")) return false;

  const explicitNavigation =
    text.startsWith("navegar") ||
    text.startsWith("ir para") ||
    text.startsWith("ir pra") ||
    text.startsWith("rota") ||
    text.startsWith("abrir mapa para") ||
    text.startsWith("abrir rota para") ||
    text.startsWith("me leve para") ||
    text.startsWith("me leva para") ||
    text.startsWith("me leve pra") ||
    text.startsWith("me leva pra");

  const addressLike =
    text.includes("rua ") ||
    text.includes("avenida ") ||
    text.includes("av ") ||
    text.includes("estrada ") ||
    text.includes("rodovia ") ||
    text.includes("travessa ") ||
    text.includes("alameda ") ||
    text.includes("praca ") ||
    text.includes("praça ") ||
    text.includes("shopping ") ||
    text.includes("mercado ") ||
    text.includes("centro ") ||
    text.includes("bairro ") ||
    text.includes("parque ");

  const placeNameLike =
    text.split(" ").length <= 8 &&
    /^[a-z0-9\s\-.,à-ú]+$/i.test(value) &&
    text.length >= 2;

  return explicitNavigation || addressLike || placeNameLike;
}

function generateSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation>(null);
  const [destination, setDestination] = useState<any>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showMap, setShowMap] = useState(false);

  const [suggestions, setSuggestions] = useState<NavigationSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");

  const [favorites, setFavorites] = useState<QuickAccessItem[]>([]);
  const [recent, setRecent] = useState<QuickAccessItem[]>([]);

  const debounceRef = useRef<number | null>(null);
  const sessionTokenRef = useRef(generateSessionToken());
  const locationRef = useRef<DeviceLocation>(null);
  const lastSuggestionQueryRef = useRef("");

  useEffect(() => {
    checkHealth().then(() => setStatus("Online"));
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
    locationRef.current = deviceLocation;
  }, [deviceLocation]);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.log("Geolocalização não suportada");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };

        console.log("LOCALIZAÇÃO INICIAL:", loc);
        setDeviceLocation(loc);
      },
      (error) => {
        console.log("Erro localização inicial:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nextLoc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };

        setDeviceLocation((prev) => {
          if (!prev) return nextLoc;

          const sameLat =
            Math.abs(Number(prev.latitude) - Number(nextLoc.latitude)) < 0.00002;
          const sameLng =
            Math.abs(Number(prev.longitude) - Number(nextLoc.longitude)) < 0.00002;
          const sameAccuracy =
            Number(prev.accuracy || 0) === Number(nextLoc.accuracy || 0);

          if (sameLat && sameLng && sameAccuracy) {
            return prev;
          }

          console.log("LOCALIZAÇÃO ATUALIZADA:", nextLoc);
          return nextLoc;
        });
      },
      (error) => {
        console.log("Erro geolocalização:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const trimmed = input.trim();
    const canSuggest = looksLikeNavigationInput(trimmed);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (!canSuggest) {
      setSuggestions([]);
      setIsSuggesting(false);
      setSuggestionsEnabled(false);
      setSuggestionError("");
      lastSuggestionQueryRef.current = "";
      return;
    }

    setSuggestionsEnabled(true);
    setSuggestionError("");

    debounceRef.current = window.setTimeout(async () => {
      try {
        setIsSuggesting(true);

        const res = await suggestNavigation(
          trimmed,
          locationRef.current,
          sessionTokenRef.current
        );

        const nextSuggestions = Array.isArray(res?.suggestions)
          ? res.suggestions
          : [];

        setSuggestions(nextSuggestions);
        lastSuggestionQueryRef.current = trimmed;

        if (nextSuggestions.length === 0) {
          setSuggestionError("Nenhuma sugestão encontrada para esse destino.");
        } else {
          setSuggestionError("");
        }
      } catch (error) {
        console.log("Erro ao buscar sugestões:", error);
        setSuggestions([]);
        setSuggestionError("Não foi possível carregar as sugestões agora.");
      } finally {
        setIsSuggesting(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [input]);

  const iniciarNavegacao = (dest: any) => {
    if (!dest?.name) return;
    console.log("Navegação interna iniciada:", dest);
  };

  async function refreshQuickAccess() {
    try {
      const res = await getNavigationQuickAccess();
      setFavorites(Array.isArray(res?.favorites) ? res.favorites : []);
      setRecent(Array.isArray(res?.recent) ? res.recent : []);
    } catch (error) {
      console.log("Erro ao atualizar favoritos e recentes:", error);
    }
  }

  async function handleSend(messageOverride?: string) {
    const trimmed = String(messageOverride ?? input).trim();
    if (!trimmed) return;

    console.log("ENVIANDO COM LOCALIZAÇÃO:", deviceLocation);

    setSuggestions([]);
    setIsSuggesting(false);
    setSuggestionsEnabled(false);
    setSuggestionError("");

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

    try {
      const res = await sendChatMessage(trimmed, deviceLocation);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.reply,
        },
      ]);

      if (res?.meta?.navigation?.active && res?.meta?.navigation?.destination) {
        const nextDestination = res.meta.navigation.destination;

        setDestination(nextDestination);
        setSteps([]);
        setShowMap(true);

        setTimeout(() => {
          iniciarNavegacao(nextDestination);
        }, 800);

        await refreshQuickAccess();
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

    setInput("");
  }

  function handleSuggestionSelect(suggestion: NavigationSuggestion) {
    setInput(suggestion.text);
    setSuggestions([]);
    setSuggestionError("");
    setSuggestionsEnabled(false);
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

  return (
    <div style={{ display: "flex", height: "100vh", background: "#343541" }}>
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
          onClick={() => setShowMap((prev) => !prev)}
          style={{
            background: "#10a37f",
            border: "none",
            padding: 12,
            borderRadius: 8,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          🗺️ {showMap ? "Fechar mapa" : "Abrir mapa"}
        </button>
      </aside>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
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
                  padding: 12,
                  borderRadius: 10,
                  maxWidth: "60%",
                  color: "#fff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: 20,
            borderTop: "1px solid #444",
            position: "relative",
          }}
        >
          {suggestionsEnabled && (suggestions.length > 0 || isSuggesting || suggestionError) && (
            <div
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 84,
                background: "#1f2937",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
                overflow: "hidden",
                zIndex: 20,
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

              {!isSuggesting && suggestionError && suggestions.length === 0 && (
                <div
                  style={{
                    padding: 14,
                    color: "#cbd5e1",
                    fontSize: 14,
                  }}
                >
                  {suggestionError}
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

          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                const trimmed = input.trim();
                if (looksLikeNavigationInput(trimmed)) {
                  setSuggestionsEnabled(true);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setSuggestionsEnabled(false);
                }, 180);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder="Digite uma mensagem ou peça navegação..."
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                border: "none",
                outline: "none",
              }}
            />
            <button
              onClick={() => handleSend()}
              style={{
                background: "#10a37f",
                border: "none",
                padding: "0 20px",
                borderRadius: 8,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      </main>

      {showMap && deviceLocation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "#111827",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 1002,
              display: "flex",
              gap: 10,
            }}
          >
            <button
              onClick={() => setShowMap(false)}
              style={{
                background: "rgba(17,24,39,0.92)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: "12px 18px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Fechar mapa
            </button>
          </div>

          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              zIndex: 1001,
              display: "flex",
              gap: 14,
              background: "rgba(17,24,39,0.72)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              padding: 16,
              color: "#fff",
            }}
          >
            <div
              style={{
                minWidth: 118,
                background: "rgba(255,255,255,0.04)",
                padding: 12,
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 14, opacity: 0.75 }}>Velocidade</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>0</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>km/h</div>
            </div>

            <div
              style={{
                minWidth: 118,
                background: "rgba(255,255,255,0.04)",
                padding: 12,
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 14, opacity: 0.75 }}>Distância</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {destination ? "--" : "--"}
              </div>
            </div>

            <div
              style={{
                minWidth: 118,
                background: "rgba(255,255,255,0.04)",
                padding: 12,
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 14, opacity: 0.75 }}>Chegada</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>--</div>
            </div>
          </div>

          <MapView
            location={deviceLocation}
            destination={destination}
            onStepsUpdate={setSteps}
          />

          <DrivingMode
            location={deviceLocation}
            destination={destination}
            steps={steps}
          />
        </div>
      )}
    </div>
  );
}