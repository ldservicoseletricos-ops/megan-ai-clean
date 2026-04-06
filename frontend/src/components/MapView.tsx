import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
  }
}

type Step = {
  instruction: string;
  end_location: { lat: number; lng: number };
};

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
  onStepsUpdate?: (steps: Step[]) => void;
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function loadGoogleMapsScript(): Promise<typeof google> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google);

    const existingScript = document.getElementById("google-maps-script") as HTMLScriptElement | null;

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

    script.onload = () => resolve(window.google!);
    script.onerror = () => reject(new Error("Falha ao carregar Google Maps"));

    document.head.appendChild(script);
  });
}

export default function MapView({
  location,
  destination,
  onStepsUpdate,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);

  const lastRouteUpdateRef = useRef(0);
  const initializedRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        if (!location || !mapRef.current || initializedRef.current) return;

        const google = await loadGoogleMapsScript();
        if (cancelled || !mapRef.current) return;

        const center = {
          lat: location.latitude,
          lng: location.longitude,
        };

        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: 19,
          tilt: 45,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        mapObj.current = map;

        trafficLayerRef.current = new google.maps.TrafficLayer();
        trafficLayerRef.current.setMap(map);

        directionsRenderer.current = new google.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor: "#22c55e",
            strokeOpacity: 0.95,
            strokeWeight: 6,
          },
        });

        originMarkerRef.current = new google.maps.Marker({
          position: center,
          map,
          title: "Você",
        });

        initializedRef.current = true;
        setMapReady(true);
      } catch (error) {
        console.error("Erro ao iniciar Google Maps:", error);
      }
    }

    initMap();

    return () => {
      cancelled = true;
    };
  }, [location]);

  useEffect(() => {
    if (!location || !mapObj.current) return;

    const current = {
      lat: location.latitude,
      lng: location.longitude,
    };

    if (originMarkerRef.current) {
      originMarkerRef.current.setPosition(current);
    }

    mapObj.current.panTo(current);
  }, [location]);

  useEffect(() => {
    if (
      !mapReady ||
      !location ||
      !destination ||
      !window.google ||
      !mapObj.current ||
      !directionsRenderer.current
    ) {
      return;
    }

    const now = Date.now();

    if (now - lastRouteUpdateRef.current < 3000) {
      return;
    }
    lastRouteUpdateRef.current = now;

    const google = window.google;
    const directionsService = new google.maps.DirectionsService();

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
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        if (status !== "OK" || !result || !result.routes?.length) {
          console.error("Erro ao calcular rota:", status, result);
          return;
        }

        let bestRouteIndex = 0;
        let bestDuration =
          result.routes[0].legs?.[0]?.duration_in_traffic?.value ??
          result.routes[0].legs?.[0]?.duration?.value ??
          Number.MAX_SAFE_INTEGER;

        result.routes.forEach((route, index) => {
          const duration =
            route.legs?.[0]?.duration_in_traffic?.value ??
            route.legs?.[0]?.duration?.value ??
            Number.MAX_SAFE_INTEGER;

          if (duration < bestDuration) {
            bestDuration = duration;
            bestRouteIndex = index;
          }
        });

        directionsRenderer.current?.setDirections(result);
        directionsRenderer.current?.setRouteIndex(bestRouteIndex);

        const bestRoute = result.routes[bestRouteIndex];
        const bestLeg = bestRoute?.legs?.[0];

        if (!bestLeg) return;

        const destinationPosition = {
          lat: destination.latitude,
          lng: destination.longitude,
        };

        if (!destinationMarkerRef.current) {
          destinationMarkerRef.current = new google.maps.Marker({
            position: destinationPosition,
            map: mapObj.current,
            title: destination.name || "Destino",
          });
        } else {
          destinationMarkerRef.current.setPosition(destinationPosition);
          destinationMarkerRef.current.setMap(mapObj.current);
        }

        const bounds = new google.maps.LatLngBounds();
        bounds.extend({
          lat: location.latitude,
          lng: location.longitude,
        });
        bounds.extend(destinationPosition);
        mapObj.current.fitBounds(bounds);

        const steps: Step[] = bestLeg.steps.map((step) => ({
          instruction: step.instructions.replace(/<[^>]+>/g, ""),
          end_location: {
            lat: step.end_location.lat(),
            lng: step.end_location.lng(),
          },
        }));

        if (onStepsUpdate) {
          onStepsUpdate(steps);
        }
      }
    );
  }, [mapReady, location, destination, onStepsUpdate]);

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}