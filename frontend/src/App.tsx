import MapView from "./components/MapView";
import DrivingMode from "./components/DrivingMode";
import { useEffect, useRef, useState } from "react";
import {
  checkHealth,
  sendChatMessage,
  suggestNavigation,
  getNavigationQuickAccess,
} from "./services/api";

/* =========================
   TIPOS
========================= */

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

/* =========================
   APP
========================= */

export default function App() {
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);
  const [destination, setDestination] = useState<Destination>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  const [showMap, setShowMap] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const [suggestions, setSuggestions] = useState<NavigationSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [favorites, setFavorites] = useState<QuickAccessItem[]>([]);
  const [recent, setRecent] = useState<QuickAccessItem[]>([]);

  /* =========================
     INIT
  ========================= */

  useEffect(() => {
    checkHealth().then(() => setStatus("Online")).catch(() => setStatus("Offline"));
  }, []);

  useEffect(() => {
    getNavigationQuickAccess()
      .then((res) => {
        setFavorites(res?.favorites || []);
        setRecent(res?.recent || []);
      })
      .catch(() => {});
  }, []);

  /* =========================
     GEOLOCATION
  ========================= */

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.watchPosition(
      (pos) => {
        setDeviceLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || null,
          speed: pos.coords.speed || null,
        });
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, []);

  /* =========================
     CHAT
  ========================= */

  async function handleSend() {
    if (!input.trim()) return;

    const userMessage = input;

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");

    try {
      const res = await sendChatMessage(userMessage, deviceLocation);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res?.reply || "OK" },
      ]);

      if (res?.meta?.navigation?.active) {
        setDestination(res.meta.navigation.destination);
        setShowMap(true);
        setRecenterSignal((p) => p + 1);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro ao responder." },
      ]);
    }
  }

  /* =========================
     UI
  ========================= */

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      {/* SIDEBAR */}
      <aside
        style={{
          width: 260,
          background: "#202123",
          color: "#fff",
          padding: 20,
        }}
      >
        <h2>Megan OS</h2>
        <p>Status: {status}</p>

        <button
          onClick={() => setShowMap((prev) => !prev)}
          style={{
            marginTop: 20,
            padding: 10,
            background: "#10a37f",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          🗺️ {showMap ? "Fechar mapa" : "Abrir mapa"}
        </button>
      </aside>

      {/* CHAT */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#343541",
        }}
      >
        {/* MENSAGENS */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div
                style={{
                  background: m.role === "user" ? "#10a37f" : "#444654",
                  padding: 12,
                  borderRadius: 10,
                  color: "#fff",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        {/* INPUT */}
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                border: "none",
              }}
            />
            <button
              onClick={handleSend}
              style={{
                background: "#10a37f",
                border: "none",
                padding: "0 20px",
                borderRadius: 8,
                color: "#fff",
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      </main>

      {/* MAPA LATERAL (FIX REAL) */}
      {showMap && deviceLocation && (
        <div
          style={{
            width: 420,
            height: "100%",
            borderLeft: "1px solid #ddd",
            position: "relative",
            background: "#fff",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 10,
            }}
          >
            <button onClick={() => setShowMap(false)}>
              ✖
            </button>
          </div>

          {destination && (
            <div style={{ position: "absolute", top: 10, left: 10, zIndex: 10 }}>
              <DrivingMode
                destination={destination}
                steps={steps}
                currentLocation={deviceLocation}
              />
            </div>
          )}

          <MapView
            location={deviceLocation}
            destination={destination}
            onStepsUpdate={setSteps}
            recenterSignal={recenterSignal}
          />
        </div>
      )}
    </div>
  );
}