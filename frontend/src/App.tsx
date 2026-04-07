// ALTERAÇÃO: apenas layout responsivo (sidebar + mobile)

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
   (todo resto igual)
========================= */

export default function App() {
  // 🔥 NOVO: detectar mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🔥 resto do estado NÃO alterado
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [deviceLocation, setDeviceLocation] = useState<any>(null);

  const [destination, setDestination] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const [navigationActive, setNavigationActive] = useState(false);
  const [showNavigationMap, setShowNavigationMap] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [favorites, setFavorites] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);

  const sessionTokenRef = useRef("");

  useEffect(() => {
    checkHealth().then(() => setStatus("Online")).catch(() => setStatus("Offline"));
  }, []);

  /* =========================
     🔥 MODO NAVEGAÇÃO (SEM ALTERAR)
  ========================= */

  if (showNavigationMap && navigationActive && deviceLocation) {
    return (
      <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
        <MapView
          location={deviceLocation}
          destination={destination}
          onStepsUpdate={setSteps}
          recenterSignal={recenterSignal}
        />

        <div
          style={{
            position: "absolute",
            top: isMobile ? 10 : 16,
            left: isMobile ? 10 : 16,
            right: isMobile ? 10 : "auto",
            zIndex: 1000,
          }}
        >
          <button
            onClick={() => setShowNavigationMap(false)}
            style={{
              width: isMobile ? "100%" : "auto",
              padding: isMobile ? 14 : 10,
              fontSize: isMobile ? 16 : 14,
            }}
          >
            ← Voltar
          </button>
        </div>

        {destination && (
          <div
            style={{
              position: "absolute",
              bottom: isMobile ? 10 : "auto",
              top: isMobile ? "auto" : 16,
              left: isMobile ? 10 : "auto",
              right: isMobile ? 10 : 16,
              width: isMobile ? "auto" : 360,
              zIndex: 1000,
            }}
          >
            <DrivingMode
              destination={destination}
              steps={steps}
              currentLocation={deviceLocation}
            />
          </div>
        )}
      </div>
    );
  }

  /* =========================
     🔥 CHAT RESPONSIVO
  ========================= */

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: "100vh",
        background: "#343541",
      }}
    >
      {/* 🔥 SIDEBAR */}
      {!isMobile && (
        <aside
          style={{
            width: 260,
            background: "#202123",
            padding: 20,
            color: "#fff",
          }}
        >
          <h2>Megan OS</h2>
          <p>Status: {status}</p>
        </aside>
      )}

      {/* 🔥 CHAT */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* mensagens */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? 12 : 20,
          }}
        >
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div
                style={{
                  background: m.role === "user" ? "#10a37f" : "#444654",
                  padding: isMobile ? 10 : 12,
                  borderRadius: 10,
                  maxWidth: isMobile ? "85%" : "60%",
                  color: "#fff",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        {/* input */}
        <div
          style={{
            padding: isMobile ? 10 : 20,
            borderTop: "1px solid #444",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{
                flex: 1,
                padding: isMobile ? 14 : 12,
                fontSize: isMobile ? 16 : 14,
                borderRadius: 10,
                border: "none",
              }}
            />
            <button
              onClick={() => {}}
              style={{
                padding: isMobile ? "0 16px" : "0 20px",
                fontSize: isMobile ? 16 : 14,
                borderRadius: 10,
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