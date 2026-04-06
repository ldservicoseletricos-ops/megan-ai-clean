import { useEffect, useRef, useState } from "react";
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

type CurrentLocation = {
  latitude: number;
  longitude: number;
  speed?: number | null;
  accuracy?: number | null;
} | null;

type DrivingModeProps = {
  destination?: Destination;
  steps?: Step[];
  currentLocation?: CurrentLocation;
};

export default function DrivingMode({
  destination = null,
  steps = [],
  currentLocation = null,
}: DrivingModeProps) {
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState("--");
  const [distance, setDistance] = useState("--");
  const [alert, setAlert] = useState<string | null>(null);

  const stepIndexRef = useRef(0);
  const warnedStepRef = useRef<number | null>(null);
  const lastRadarWarningRef = useRef(0);
  const lastBackendAlertRef = useRef("");
  const arrivalSpokenRef = useRef(false);
  const lastBackendSendRef = useRef(0);

  useEffect(() => {
    if (!currentLocation) return;

    if (typeof currentLocation.speed === "number" && !Number.isNaN(currentLocation.speed)) {
      const kmh = Math.max(0, Math.round(currentLocation.speed * 3.6));
      setSpeed(kmh);

      const now = Date.now();

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
  }, [currentLocation]);

  useEffect(() => {
    if (!currentLocation || !destination) return;

    const sendToBackend = async () => {
      try {
        const now = Date.now();
        if (now - lastBackendSendRef.current < 3500) return;
        lastBackendSendRef.current = now;

        const response = await sendLocationToBackend({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          speed: currentLocation.speed ?? null,
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
    };

    sendToBackend();
  }, [currentLocation, destination]);

  useEffect(() => {
    if (!currentLocation || steps.length === 0) return;

    const stepIndex = stepIndexRef.current;
    const step = steps[stepIndex];

    if (!step) return;

    const dist = Math.hypot(
      currentLocation.latitude - step.end_location.lat,
      currentLocation.longitude - step.end_location.lng
    );

    if (dist < 0.002 && warnedStepRef.current !== stepIndex) {
      speak(`Em breve, ${step.instruction}`);
      warnedStepRef.current = stepIndex;
    }

    if (dist < 0.0003) {
      speak(step.instruction);
      stepIndexRef.current += 1;
      warnedStepRef.current = null;
    }

    if (dist < 0.0001 && !arrivalSpokenRef.current) {
      speak("Você chegou ao destino");
      arrivalSpokenRef.current = true;
    }
  }, [currentLocation, steps]);

  useEffect(() => {
    if (!destination) {
      stepIndexRef.current = 0;
      warnedStepRef.current = null;
      arrivalSpokenRef.current = false;
      setEta("--");
      setDistance("--");
      setAlert(null);
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