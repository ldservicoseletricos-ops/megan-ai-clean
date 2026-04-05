import { useEffect, useState } from "react";

type Location = {
  latitude: number;
  longitude: number;
  speed: number | null;
};

export function useDrivingMode() {
  const [location, setLocation] = useState<Location | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Geolocalização não suportada");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          speed: pos.coords.speed,
        });
      },
      (err) => {
        console.error("Erro localização:", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return location;
}