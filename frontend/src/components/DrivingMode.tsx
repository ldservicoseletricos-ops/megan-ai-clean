import { useEffect, useMemo, useRef, useState } from "react";
import { sendLocationToBackend } from "../services/driving.service";
import {
  isVoiceMuted,
  setVoiceMuted,
  speak,
  stopSpeaking,
} from "../utils/voice";

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

type RouteSummary = {
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  trafficDurationText?: string;
  trafficDurationSeconds?: number;
  destinationLabel?: string;
} | null;

type DrivingModeProps = {
  destination?: Destination;
  steps?: Step[];
  currentLocation?: CurrentLocation;
  routeSummary?: RouteSummary;
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

function normalizeKey(text: string) {
  return cleanInstruction(text).toLowerCase();
}

function getSpeedKmh(speed?: number | null) {
  if (typeof speed !== "number" || Number.isNaN(speed)) return 0;
  return Math.max(0, Math.round(speed * 3.6));
}

function getPreviewDistanceMeters(speedKmh: number) {
  if (speedKmh >= 90) return 300;
  if (speedKmh >= 70) return 220;
  if (speedKmh >= 50) return 170;
  if (speedKmh >= 30) return 120;
  return 80;
}

function getNowDistanceMeters(speedKmh: number) {
  if (speedKmh >= 90) return 80;
  if (speedKmh >= 70) return 65;
  if (speedKmh >= 50) return 50;
  if (speedKmh >= 30) return 35;
  return 25;
}

function getArriveStepThresholdMeters(accuracy?: number | null) {
  if (typeof accuracy === "number" && !Number.isNaN(accuracy)) {
    return Math.max(16, Math.min(accuracy * 1.25, 28));
  }
  return 20;
}

function formatPreviewDistance(meters: number) {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km.toFixed(1).replace(".", ",")} quilômetro${km >= 1.95 ? "s" : ""}`;
  }

  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  return `${rounded} metros`;
}

export default function DrivingMode({
  destination = null,
  steps = [],
  currentLocation = null,
  routeSummary = null,
}: DrivingModeProps) {
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState("--");
  const [distance, setDistance] = useState("--");
  const [alert, setAlert] = useState<string | null>(null);
  const [nextInstruction, setNextInstruction] = useState("Siga em frente");
  const [nextDistance, setNextDistance] = useState<string>("");
  const [voiceMuted, setVoiceMutedState] = useState(isVoiceMuted());

  const stepIndexRef = useRef(0);
  const spokenPreviewRef = useRef<Set<string>>(new Set());
  const spokenNowRef = useRef<Set<string>>(new Set());
  const lastRadarWarningRef = useRef(0);
  const lastBackendAlertRef = useRef("");
  const arrivalSpokenRef = useRef(false);
  const lastBackendSendRef = useRef(0);
  const previousDistanceToCurrentStepRef = useRef<number | null>(null);
  const stableStepAdvanceRef = useRef(0);

  const cleanedSteps = useMemo(
    () =>
      (steps || [])
        .map((step) => ({
          instruction: cleanInstruction(step.instruction),
          end_location: step.end_location,
        }))
        .filter((step) => step.instruction && step.end_location),
    [steps]
  );

  function handleToggleVoice() {
    const next = !voiceMuted;
    setVoiceMuted(next);
    setVoiceMutedState(next);

    if (next) {
      stopSpeaking();
    } else {
      speak("Voz ativada");
    }
  }

  useEffect(() => {
    setVoiceMutedState(isVoiceMuted());
  }, []);

  useEffect(() => {
    if (!currentLocation) return;

    const kmh = getSpeedKmh(currentLocation.speed);
    setSpeed(kmh);

    const now = Date.now();

    if (kmh > 80 && now - lastRadarWarningRef.current > 20000) {
      speak("Atenção, reduza a velocidade");
      lastRadarWarningRef.current = now;
    } else if (kmh > 60 && kmh <= 80 && now - lastRadarWarningRef.current > 30000) {
      speak("Possível radar à frente");
      lastRadarWarningRef.current = now;
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
      spokenPreviewRef.current = new Set();
      spokenNowRef.current = new Set();
      arrivalSpokenRef.current = false;
      previousDistanceToCurrentStepRef.current = null;
      stableStepAdvanceRef.current = 0;
      setEta("--");
      setDistance("--");
      setAlert(null);
      setNextInstruction("Siga em frente");
      setNextDistance("");
      return;
    }
  }, [destination]);

  useEffect(() => {
    if (!routeSummary) return;

    if (routeSummary.trafficDurationText || routeSummary.durationText) {
      setEta(routeSummary.trafficDurationText || routeSummary.durationText);
    }

    if (routeSummary.distanceText) {
      setDistance(routeSummary.distanceText);
    }
  }, [routeSummary]);

  useEffect(() => {
    if (!cleanedSteps.length) {
      setNextInstruction("Siga em frente");
      setNextDistance("");
      return;
    }

    const currentStep = cleanedSteps[Math.min(stepIndexRef.current, cleanedSteps.length - 1)];
    if (currentStep?.instruction) {
      setNextInstruction(currentStep.instruction);
    }
  }, [cleanedSteps]);

  useEffect(() => {
    if (!currentLocation || cleanedSteps.length === 0) return;

    const currentIndex = Math.min(stepIndexRef.current, cleanedSteps.length - 1);
    const step = cleanedSteps[currentIndex];
    if (!step) return;

    const speedKmh = getSpeedKmh(currentLocation.speed);
    const previewDistance = getPreviewDistanceMeters(speedKmh);
    const nowDistance = getNowDistanceMeters(speedKmh);
    const arriveThreshold = getArriveStepThresholdMeters(currentLocation.accuracy);

    const distMeters = haversineMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      step.end_location.lat,
      step.end_location.lng
    );

    const previousDistance = previousDistanceToCurrentStepRef.current;
    previousDistanceToCurrentStepRef.current = distMeters;

    const approaching =
      previousDistance === null
        ? true
        : distMeters <= previousDistance + 12;

    setNextInstruction(step.instruction);
    setNextDistance(
      distMeters >= 1000
        ? `${(distMeters / 1000).toFixed(1).replace(".", ",")} km`
        : `${Math.max(1, Math.round(distMeters))} m`
    );

    const stepKey = `${currentIndex}:${normalizeKey(step.instruction)}`;

    if (
      distMeters <= previewDistance &&
      distMeters > nowDistance &&
      approaching &&
      !spokenPreviewRef.current.has(stepKey)
    ) {
      speak(`Em ${formatPreviewDistance(distMeters)}, ${step.instruction}`);
      spokenPreviewRef.current.add(stepKey);
    }

    if (
      distMeters <= nowDistance &&
      approaching &&
      !spokenNowRef.current.has(stepKey)
    ) {
      speak(step.instruction, "high");
      spokenNowRef.current.add(stepKey);
    }

    if (distMeters <= arriveThreshold) {
      stableStepAdvanceRef.current += 1;
    } else {
      stableStepAdvanceRef.current = 0;
    }

    if (stableStepAdvanceRef.current >= 2) {
      if (stepIndexRef.current < cleanedSteps.length - 1) {
        stepIndexRef.current += 1;
        previousDistanceToCurrentStepRef.current = null;
        stableStepAdvanceRef.current = 0;

        const nextStep = cleanedSteps[stepIndexRef.current];
        if (nextStep?.instruction) {
          setNextInstruction(nextStep.instruction);
          setNextDistance("");
        }
      } else if (!arrivalSpokenRef.current) {
        speak("Você chegou ao destino", "high");
        arrivalSpokenRef.current = true;
        setNextInstruction("Você chegou ao destino");
        setNextDistance("");
      }
    }
  }, [currentLocation, cleanedSteps]);

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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.72 }}>
          Navegação por voz
        </div>

        <button
          onClick={handleToggleVoice}
          style={{
            background: voiceMuted ? "rgba(153,27,27,0.95)" : "rgba(6,95,70,0.95)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {voiceMuted ? "Som mutado" : "Som ligado"}
        </button>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: "14px 14px 12px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 8 }}>
          Próxima instrução
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
          {nextInstruction}
        </div>
        {nextDistance ? (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.82 }}>
            {nextDistance}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 6 }}>Velocidade</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{speed} km/h</div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 6 }}>Tempo</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{eta}</div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.72, marginBottom: 6 }}>Distância</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{distance}</div>
        </div>
      </div>

      {alert ? (
        <div
          style={{
            background: "rgba(180,83,9,0.95)",
            border: "1px solid rgba(251,191,36,0.28)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {alert}
        </div>
      ) : null}

      {destination?.name ? (
        <div style={{ fontSize: 12, opacity: 0.74 }}>
          Destino: {destination.name}
        </div>
      ) : null}
    </div>
  );
}
