import { useEffect, useState } from "react";
import { useDrivingMode } from "../hooks/useDrivingMode";
import { sendLocationToBackend } from "../services/driving.service";
import { speak } from "../utils/voice";

export default function DrivingMode() {
  const location = useDrivingMode();
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!location) return;

    const interval = setInterval(async () => {
      const response = await sendLocationToBackend(location);

      if (response.alert) {
        setAlert(response.alert);
        speak(response.alert);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [location]);

  return (
    <div style={{
      position: "fixed",
      top: 10,
      right: 10,
      background: "#111",
      color: "#fff",
      padding: "10px",
      borderRadius: "10px"
    }}>
      🚗 Modo Direção Ativo
      {alert && <div style={{ marginTop: 10 }}>{alert}</div>}
    </div>
  );
}