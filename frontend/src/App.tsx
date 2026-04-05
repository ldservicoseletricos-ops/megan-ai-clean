import MapView from "./components/MapView";
import { useEffect, useState } from "react";
import {
  checkHealth,
  sendChatMessage,
  resolveNavigationDestination,
} from "./services/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function isNavigationRequest(message: string) {
  const text = String(message || "").toLowerCase().trim();

  return [
    "navegar para ",
    "navegação para ",
    "ir para ",
    "me leve para ",
    "quero ir para ",
    "rota para ",
    "abrir rota para ",
    "iniciar rota para ",
    "traçar rota para ",
  ].some((pattern) => text.includes(pattern));
}

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
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDeviceLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
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

    let navigationReply = "";
    let navigationResolved = false;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
    ]);

    try {
      if (isNavigationRequest(trimmed)) {
        try {
          const navResult = await resolveNavigationDestination(trimmed);

          if (
            navResult?.ok &&
            navResult?.navigation?.active &&
            navResult?.navigation?.destination
          ) {
            setDestination(navResult.navigation.destination);
            setShowMap(true);
            navigationResolved = true;
            navigationReply = `Certo, abrindo a navegação para ${navResult.navigation.destination.name}.`;
          }
        } catch (err) {
          console.log("Erro navigation resolve:", err);
        }
      }

      const res = await sendChatMessage(trimmed, deviceLocation);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: navigationResolved
            ? navigationReply
            : res.reply,
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
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
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
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSend();
                }
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
            width: 420,
            background: "#111827",
            padding: 10,
            color: "#fff",
            borderLeft: "1px solid #2a2b32",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {!destination && (
            <div
              style={{
                background: "#1f2937",
                padding: 12,
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              Mapa aberto. Para iniciar uma rota, peça no chat algo como:
              <br />
              <strong>“navegar para Praça da Moça Diadema”</strong>
            </div>
          )}

          <MapView location={deviceLocation} destination={destination} />
        </div>
      )}
    </div>
  );
}