import { useEffect, useState, useRef } from "react";
import { useDrivingMode } from "../hooks/useDrivingMode";
import { sendLocationToBackend } from "../services/driving.service";
import { speak } from "../utils/voice";

type Destination = {
  latitude: number;
  longitude: number;
  name?: string;
} | null;

type Step = {
  instruction: string;
  end_location: { lat: number; lng: number };
};

type DrivingModeProps = {
  destination?: Destination;
  steps?: Step[];
};

export default function DrivingMode({
  destination = null,
  steps = [],
}: DrivingModeProps) {
  const location = useDrivingMode();

  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState("--");
  const [distance, setDistance] = useState("--");
  const [alert, setAlert] = useState<string | null>(null);

  const stepIndexRef = useRef(0);
  const warnedStepRef = useRef<number | null>(null);
  const lastRadarWarningRef = useRef(0);
  const lastBackendAlertRef = useRef("");
  const arrivalSpokenRef = useRef(false);

  useEffect(() => {
    if (!location) return;

    if (location.speed) {
      const kmh = Math.round(location.speed * 3.6);
      setSpeed(kmh);

      const now = Date.now();

      // radar inteligente sem spam
      if (kmh > 80 && now - lastRadarWarningRef.current > 12000) {
        speak("Atenção, reduza a velocidade");
        lastRadarWarningRef.current = now;
      } else if (kmh > 60 && kmh <= 80 && now - lastRadarWarningRef.current > 18000) {
        speak("Possível radar à frente");
        lastRadarWarningRef.current = now;
      }
    } else {
      setSpeed(0);
    }

    const interval = setInterval(async () => {
      try {
        const response = await sendLocationToBackend({
          ...location,
          destination,
        });

        if (response.eta) setEta(response.eta);
        if (response.distance) setDistance(response.distance);

        if (response.alert) {
          setAlert(response.alert);

          if (response.alert !== lastBackendAlertRef.current) {
            speak(response.alert);
            lastBackendAlertRef.current = response.alert;
          }
        } else {
          setAlert(null);
          lastBackendAlertRef.current = "";
        }
      } catch (error) {
        console.error("Erro DrivingMode:", error);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [location, destination]);

  useEffect(() => {
    if (!location || steps.length === 0) return;

    const stepIndex = stepIndexRef.current;
    const step = steps[stepIndex];

    if (!step) return;

    const dist = Math.hypot(
      location.latitude - step.end_location.lat,
      location.longitude - step.end_location.lng
    );

    // aviso antecipado em ~200m
    if (dist < 0.002 && warnedStepRef.current !== stepIndex) {
      speak(`Em breve, ${step.instruction}`);
      warnedStepRef.current = stepIndex;
    }

    // instrução no ponto da curva
    if (dist < 0.0003) {
      speak(step.instruction);
      stepIndexRef.current += 1;
      warnedStepRef.current = null;
    }

    // chegada
    if (dist < 0.0001 && !arrivalSpokenRef.current) {
      speak("Você chegou ao destino");
      arrivalSpokenRef.current = true;
    }
  }, [location, steps]);

  useEffect(() => {
    if (!destination) {
      stepIndexRef.current = 0;
      warnedStepRef.current = null;
      arrivalSpokenRef.current = false;
    }
  }, [destination]);

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