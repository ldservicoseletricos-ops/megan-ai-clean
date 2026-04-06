import { useEffect, useState } from "react";
import { useDrivingMode } from "../hooks/useDrivingMode";
import { sendLocationToBackend } from "../services/driving.service";
import { speak } from "../utils/voice";

type Destination = {
  latitude: number;
  longitude: number;
  name?: string;
} | null;

type DrivingModeProps = {
  destination?: Destination;
};

export default function DrivingMode({ destination = null }: DrivingModeProps) {
  const location = useDrivingMode();

  const [alert, setAlert] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(0);
  const [eta, setEta] = useState<string>("--");
  const [distance, setDistance] = useState<string>("--");

  useEffect(() => {
    if (!location) return;

    if (location.speed) {
      const kmh = Math.round(location.speed * 3.6);
      setSpeed(kmh);
    } else {
      setSpeed(0);
    }

    const interval = setInterval(async () => {
      try {
        const response = await sendLocationToBackend({
          ...location,
          destination,
        });

        if (response.alert) {
          setAlert(response.alert);
          speak(response.alert);
        } else {
          setAlert(null);
        }

        if (response.eta) {
          setEta(response.eta);
        }

        if (response.distance) {
          setDistance(response.distance);
        }
      } catch (error) {
        console.error("Erro no DrivingMode:", error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [location, destination]);

  return (
    <div
      style={{
        background: "rgba(17,24,39,0.92)",
        color: "#fff",
        padding: "14px 16px",
        borderRadius: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.08)",
        minWidth: "280px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Velocidade</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
            {speed} km/h
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Distância</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {distance}
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Chegada</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {eta}
          </div>
        </div>
      </div>

      {alert && (
        <div
          style={{
            background: "rgba(220,38,38,0.95)",
            padding: "10px 12px",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.4,
          }}
        >
          ⚠️ {alert}
        </div>
      )}
    </div>
  );
}