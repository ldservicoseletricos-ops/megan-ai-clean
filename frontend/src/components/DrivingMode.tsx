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

function cleanInstruction(text: string) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default function DrivingMode({
  destination = null,
  steps = [],
  currentLocation = null,
}: DrivingModeProps) {
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState("--");
  const [distance, setDistance] = useState("--");
  const [alert, setAlert] = useState<string | null>(null);
  const [nextInstruction, setNextInstruction] = useState("Siga em frente");

  const stepIndexRef = useRef(0);
  const announcedPreviewRef = useRef<string>("");
  const announcedNowRef = useRef<string>("");
  const lastRadarWarningRef = useRef(0);
  const lastBackendAlertRef = useRef("");
  const arrivalSpokenRef = useRef(false);
  const lastBackendSendRef = useRef(0);
  const lastDistanceToStepRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentLocation) return;

    if (
      typeof currentLocation.speed === "number" &&
      !Number.isNaN(currentLocation.speed)
    ) {
      const kmh = Math.max(0, Math.round(currentLocation.speed * 3.6));
      setSpeed(kmh);

      const now = Date.now();

      if (kmh > 80 && now - lastRadarWarningRef.current > 20000) {
        speak("Atenção, reduza a velocidade");
        lastRadarWarningRef.current = now;
      } else if (kmh > 60 && kmh <= 80 && now - lastRadarWarningRef.current > 30000) {
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
        if (now - lastBackendSendRef.current < 6000) return;
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
            speak(response.alert, "high");
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
    if (!destination) {
      stepIndexRef.current = 0;
      announcedPreviewRef.current = "";
      announcedNowRef.current = "";
      arrivalSpokenRef.current = false;
      lastDistanceToStepRef.current = null;
      setEta("--");
      setDistance("--");
      setAlert(null);
      setNextInstruction("Siga em frente");
      return;
    }
  }, [destination]);

  useEffect(() => {
    if (!steps.length) {
      setNextInstruction("Siga em frente");
      return;
    }

    const currentStep = steps[stepIndexRef.current];
    if (currentStep?.instruction) {
      setNextInstruction(cleanInstruction(currentStep.instruction));
    }
  }, [steps]);

  useEffect(() => {
    if (!currentLocation || steps.length === 0) return;

    const currentIndex = Math.min(stepIndexRef.current, steps.length - 1);
    const step = steps[currentIndex];
    if (!step) return;

    const instruction = cleanInstruction(step.instruction);
    setNextInstruction(instruction);

    const distMeters = haversineMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      step.end_location.lat,
      step.end_location.lng
    );

    const previousDistance = lastDistanceToStepRef.current;
    lastDistanceToStepRef.current = distMeters;

    const approaching =
      previousDistance === null ? true : distMeters < previousDistance + 8;

    if (
      distMeters <= 180 &&
      distMeters > 45 &&
      approaching &&
      announcedPreviewRef.current !== `${currentIndex}:${instruction}`
    ) {
      speak(`Em ${Math.round(distMeters / 10) * 10} metros, ${instruction}`);
      announcedPreviewRef.current = `${currentIndex}:${instruction}`;
    }

    if (
      distMeters <= 40 &&
      approaching &&
      announcedNowRef.current !== `${currentIndex}:${instruction}`
    ) {
      speak(instruction, "high");
      announcedNowRef.current = `${currentIndex}:${instruction}`;
    }

    if (distMeters <= 18) {
      if (stepIndexRef.current < steps.length - 1) {
        stepIndexRef.current += 1;
        announcedPreviewRef.current = "";
        announcedNowRef.current = "";
        lastDistanceToStepRef.current = null;

        const nextStep = steps[stepIndexRef.current];
        if (nextStep?.instruction) {
          setNextInstruction(cleanInstruction(nextStep.instruction));
        }
      } else if (!arrivalSpokenRef.current) {
        speak("Você chegou ao destino", "high");
        arrivalSpokenRef.current = true;
        setNextInstruction("Você chegou ao destino");
      }
    }
  }, [currentLocation, steps]);

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
          background: "rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
          Próxima instrução
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
          {nextInstruction}
        </div>
      </div>

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