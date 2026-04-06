import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

type Step = {
  instruction: string;
  end_location: { lat: number; lng: number };
};

export default function DrivingMode({
  destination,
  steps,
}: {
  destination: any;
  steps: Step[];
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distance, setDistance] = useState("--");
  const [eta, setEta] = useState("--");
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!destination) return;

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const speed = pos.coords.speed || 0;

        try {
          // 🔥 DRIVING (distância + ETA)
          const res = await axios.post(`${API_URL}/api/driving`, {
            latitude,
            longitude,
            speed,
            destination,
          });

          if (res.data) {
            setDistance(res.data.distance || "--");
            setEta(res.data.eta || "--");
          }

          // 🔥 RADAR
          const radar = await axios.post(`${API_URL}/api/driving/radar`, {
            latitude,
            longitude,
            speed,
          });

          if (radar.data?.alert) {
            setAlert(radar.data.alert);

            // 🔊 voz automática
            const speech = new SpeechSynthesisUtterance(radar.data.alert);
            speech.lang = "pt-BR";
            window.speechSynthesis.speak(speech);
          }

        } catch (err) {
          console.log("Erro driving:", err);
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [destination]);

  const currentStep = steps[currentStepIndex];

  return (
    <div
      style={{
        background: "#111827",
        color: "#fff",
        padding: 20,
        borderRadius: 12,
      }}
    >
      <h3>🚗 Navegação ativa</h3>

      <p><strong>Destino:</strong> {destination?.name}</p>

      <p><strong>Distância:</strong> {distance}</p>
      <p><strong>ETA:</strong> {eta}</p>

      {currentStep && (
        <div style={{ marginTop: 10 }}>
          <strong>Próxima ação:</strong>
          <p>{currentStep.instruction}</p>
        </div>
      )}

      {alert && (
        <div
          style={{
            marginTop: 15,
            background: "red",
            padding: 10,
            borderRadius: 8,
          }}
        >
          {alert}
        </div>
      )}
    </div>
  );
}