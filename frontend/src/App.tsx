import MapView from "./components/MapView";
import DrivingMode from "./components/DrivingMode";
import { useEffect, useState } from "react";
import {
  checkHealth,
  sendChatMessage
} from "./services/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function App() {
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [deviceLocation, setDeviceLocation] = useState<any>(null);
  const [destination, setDestination] = useState<any>(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    checkHealth().then(() => setStatus("Online"));
  }, []);

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
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };

        console.log("LOCALIZAÇÃO ATUALIZADA:", loc);
        setDeviceLocation(loc);
      },
      (error) => {
        console.log("Erro geolocalização:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    console.log("ENVIANDO COM LOCALIZAÇÃO:", deviceLocation);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
    ]);

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
        setDestination(res.meta.navigation.destination);
        setShowMap(true);
      }
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
        }}
      >
        <div>
          <h2>Megan OS</h2>
          <p style={{ fontSize: 12, opacity: 0.7 }}>Status: {status}</p>
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

        <div style={{ padding: 20, borderTop: "1px solid #444" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
              onClick={handleSend}
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
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                backdropFilter: "blur(8px)",
              }}
            >
              Fechar mapa
            </button>
          </div>

          {destination && (
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                zIndex: 1002,
                width: 360,
                maxWidth: "calc(100vw - 32px)",
              }}
            >
              <DrivingMode destination={destination} />
            </div>
          )}

          <div style={{ width: "100%", height: "100%" }}>
            <MapView location={deviceLocation} destination={destination} />
          </div>
        </div>
      )}
    </div>
  );
}