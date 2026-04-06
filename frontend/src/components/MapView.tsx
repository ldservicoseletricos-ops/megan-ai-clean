import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
  }
}

type MapViewProps = {
  location: {
    latitude: number;
    longitude: number;
  } | null;
  destination?: {
    latitude: number;
    longitude: number;
    name?: string;
  } | null;
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function loadGoogleMapsScript(): Promise<typeof google> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const existingScript = document.getElementById(
      "google-maps-script"
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps carregou sem window.google.maps"));
      });
      existingScript.addEventListener("error", () => {
        reject(new Error("Falha ao carregar Google Maps"));
      });
      return;
    }

    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("VITE_GOOGLE_MAPS_API_KEY não configurada"));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps carregou sem window.google.maps"));
    };

    script.onerror = () => {
      reject(new Error("Falha ao carregar Google Maps"));
    };

    document.head.appendChild(script);
  });
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);

  const brng = Math.atan2(y, x);
  return (((brng * 180) / Math.PI) + 360) % 360;
}

function smoothRotation(prev: number, next: number) {
  const diff = ((next - prev + 540) % 360) - 180;
  return prev + diff * 0.2;
}

export default function MapView({ location, destination }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(
    null
  );
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(
    null
  );
  const lastRotationRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [distanceLeft, setDistanceLeft] = useState("--");
  const [eta, setEta] = useState("--");
  const [rotation, setRotation] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      try {
        if (!mapRef.current || !location) return;

        const googleApi = await loadGoogleMapsScript();

        if (!mounted || !mapRef.current) return;

        const center = {
          lat: location.latitude,
          lng: location.longitude,
        };

        const map = new googleApi.maps.Map(mapRef.current, {
          center,
          zoom: 19,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          tilt: 45,
          heading: 0,
          mapId: undefined,
        });

        googleMapRef.current = map;

        userMarkerRef.current = new googleApi.maps.Marker({
          position: center,
          map,
          title: "Você",
          icon: {
            path: googleApi.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#22c55e",
            fillOpacity: 1,
            strokeColor: "#dcfce7",
            strokeWeight: 2,
            rotation: 0,
          },
          zIndex: 10,
        });

        directionsRendererRef.current = new googleApi.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor: "#22c55e",
            strokeOpacity: 0.95,
            strokeWeight: 6,
          },
        });

        infoWindowRef.current = new googleApi.maps.InfoWindow();

        setMapReady(true);
        setErrorMessage("");
      } catch (error) {
        console.error("Erro ao iniciar Google Maps:", error);
        setErrorMessage("Não foi possível carregar o Google Maps.");
      }
    }

    initMap();

    return () => {
      mounted = false;
    };
  }, [location]);

  useEffect(() => {
    if (!mapReady || !location || !googleMapRef.current || !window.google) return;

    const map = googleMapRef.current;
    const googleApi = window.google;

    const current = {
      lat: location.latitude,
      lng: location.longitude,
    };

    if (!lastLocationRef.current) {
      lastLocationRef.current = {
        latitude: location.latitude,
        longitude: location.longitude,
      };
    } else {
      const bearing = getBearing(
        lastLocationRef.current.latitude,
        lastLocationRef.current.longitude,
        location.latitude,
        location.longitude
      );

      const smooth = smoothRotation(lastRotationRef.current, bearing);

      setRotation(smooth);
      lastRotationRef.current = smooth;
      lastLocationRef.current = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      map.setHeading(smooth);

      if (userMarkerRef.current) {
        userMarkerRef.current.setIcon({
          path: googleApi.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#dcfce7",
          strokeWeight: 2,
          rotation: smooth,
        });
      }
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(current);
    }

    const offsetDistance = 0.0007;
    const targetCenter = {
      lat: current.lat + offsetDistance,
      lng: current.lng,
    };

    map.panTo(targetCenter);
    map.setZoom(19);
    map.setTilt(45);
  }, [location, mapReady]);

  useEffect(() => {
    if (
      !mapReady ||
      !location ||
      !destination ||
      !window.google ||
      !googleMapRef.current ||
      !directionsRendererRef.current
    ) {
      return;
    }

    const googleApi = window.google;
    const map = googleMapRef.current;

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new googleApi.maps.Marker({
        position: {
          lat: destination.latitude,
          lng: destination.longitude,
        },
        map,
        title: destination.name || "Destino",
      });
    } else {
      destinationMarkerRef.current.setPosition({
        lat: destination.latitude,
        lng: destination.longitude,
      });
      destinationMarkerRef.current.setMap(map);
    }

    const directionsService = new googleApi.maps.DirectionsService();

    directionsService.route(
      {
        origin: {
          lat: location.latitude,
          lng: location.longitude,
        },
        destination: {
          lat: destination.latitude,
          lng: destination.longitude,
        },
        travelMode: googleApi.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: googleApi.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        if (status === "OK" && result) {
          directionsRendererRef.current?.setDirections(result);

          const leg = result.routes?.[0]?.legs?.[0];
          if (leg) {
            setDistanceLeft(leg.distance?.text || "--");
            setEta(leg.duration_in_traffic?.text || leg.duration?.text || "--");

            if (infoWindowRef.current && destinationMarkerRef.current) {
              infoWindowRef.current.setContent(
                `<div style="font-size:14px;"><strong>${
                  destination.name || "Destino"
                }</strong><br/>Distância: ${leg.distance?.text || "--"}<br/>ETA: ${
                  leg.duration_in_traffic?.text || leg.duration?.text || "--"
                }</div>`
              );
            }
          }

          setErrorMessage("");
        } else {
          console.error("Erro ao calcular rota no Google Maps:", status);
          setErrorMessage("Não foi possível calcular a rota no Google Maps.");
        }
      }
    );
  }, [destination, location, mapReady]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1002,
          background: "rgba(17,24,39,0.92)",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: 12,
          display: "flex",
          gap: 18,
          alignItems: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          fontWeight: 700,
          backdropFilter: "blur(8px)",
        }}
      >
        <span>📍 {distanceLeft}</span>
        <span>⏱️ {eta}</span>
        <span>🧭 {Math.round(rotation)}°</span>
      </div>

      {errorMessage && (
        <div
          style={{
            position: "absolute",
            top: 72,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1002,
            background: "rgba(127,29,29,0.95)",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      )}

      {!GOOGLE_MAPS_API_KEY && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1003,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
            color: "#fff",
            padding: 24,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          Configure VITE_GOOGLE_MAPS_API_KEY no frontend para usar o Google Maps.
        </div>
      )}

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}