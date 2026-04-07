import { useEffect, useState } from "react";
import MapView from "./components/MapView";
import DrivingMode from "./components/DrivingMode";

import {
  sendChatMessage,
  resolveNavigationDestination,
} from "./services/api";

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
} | null;

function App() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [deviceLocation, setDeviceLocation] =
    useState<DeviceLocation>(null);

  const [navigationActive, setNavigationActive] = useState(false);
  const [destination, setDestination] = useState<any>(null);
  const [routeSummary, setRouteSummary] = useState<any>(null);

  /* =========================
     GPS FIXO (NÃO REINICIA)
  ========================= */
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDeviceLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
        });
      },
      (err) => console.error(err),
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  /* =========================
     ENVIAR MENSAGEM
  ========================= */
  async function handleSend() {
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");

    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setLoading(true);

    try {
      /* 🔥 tenta resolver destino */
      const resolved = await resolveNavigationDestination(
        userMessage,
        deviceLocation
      );

      let navigationPayload = null;

      if (resolved?.destination) {
        navigationPayload = {
          destination: resolved.destination,
        };

        setDestination(resolved.destination);
        setNavigationActive(true);
      }

      const response = await sendChatMessage(
        userMessage,
        deviceLocation,
        navigationPayload
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: response.reply },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Erro ao processar mensagem" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     CANCELAR NAVEGAÇÃO
  ========================= */
  function cancelarNavegacao() {
    setNavigationActive(false);
    setDestination(null);
    setRouteSummary(null);
  }

  /* =========================
     ABRIR WAZE
  ========================= */
  function abrirWaze() {
    if (!destination) return;

    const lat = destination.latitude;
    const lng = destination.longitude;

    const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    window.open(url, "_blank");
  }

  /* =========================
     UI
  ========================= */
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* CHAT */}
      <div style={{ width: "35%", padding: 20, overflow: "auto" }}>
        <h2>Megan OS</h2>

        {messages.map((msg, i) => (
          <div key={i}>
            <b>{msg.role === "user" ? "Você" : "Megan"}:</b> {msg.text}
          </div>
        ))}

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite..."
          style={{ width: "100%", marginTop: 10 }}
        />

        <button onClick={handleSend} disabled={loading}>
          {loading ? "..." : "Enviar"}
        </button>

        {navigationActive && (
          <div style={{ marginTop: 10 }}>
            <button onClick={cancelarNavegacao}>
              Encerrar navegação
            </button>

            <button onClick={abrirWaze}>
              Abrir no Waze
            </button>
          </div>
        )}
      </div>

      {/* MAPA */}
      <div style={{ flex: 1 }}>
        <MapView
          deviceLocation={deviceLocation}
          destination={destination}
          navigationActive={navigationActive}
          onRouteDataUpdate={setRouteSummary}
        />
      </div>

      {/* DIREÇÕES */}
      {navigationActive && (
        <DrivingMode routeSummary={routeSummary} />
      )}
    </div>
  );
}

export default App;