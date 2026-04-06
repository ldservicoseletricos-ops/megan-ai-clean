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
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const existingScript = document.getElementById(
      "google-maps-script"
    ) as HTMLScriptElement | null;

    if (existingScript) {
      const handleLoad = () => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps carregou sem window.google.maps"));
      };

      const handleError = () => {
        reject(new Error("Falha ao carregar Google Maps"));
      };

      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
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

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getStepInstructions(route?: google.maps.DirectionsRoute | null) {
  if (!route?.legs?.length) return [];

  return route.legs[0].steps.map((step) => ({
    instruction: step.instructions?.replace(/<[^>]+>/g, "") || "Siga em frente",
    end_location: {
      lat: step.end_location?.lat() || 0,
      lng: step.end_location?.lng() || 0,
    },
  }));
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

  const initializedRef = useRef(false);
  const hasCenteredInitialLocationRef = useRef(false);
  const lastRouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteDestinationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastViewportDestinationRef = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        if (!location || !mapRef.current) {
          setLoadingMap(false);
          return;
        }

        if (initializedRef.current && mapObj.current) {
          setMapReady(true);
          setLoadingMap(false);
          return;
        }

        setLoadingMap(true);
        setErrorMessage("");

        const google = await loadGoogleMapsScript();

        if (cancelled || !mapRef.current) return;

        const center = {
          lat: location.latitude,
          lng: location.longitude,
        };

        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: 17,
          tilt: 0,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: "greedy",
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
        hasCenteredInitialLocationRef.current = true;
        setMapReady(true);
        setLoadingMap(false);

        window.setTimeout(() => {
          if (mapObj.current && window.google?.maps) {
            window.google.maps.event.trigger(mapObj.current, "resize");
          }
        }, 150);
      } catch (error: any) {
        console.error("Erro ao iniciar Google Maps:", error);
        setErrorMessage(
          error?.message || "Não foi possível carregar o Google Maps."
        );
        setLoadingMap(false);
        setMapReady(false);
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

    if (!hasCenteredInitialLocationRef.current) {
      mapObj.current.setCenter(current);
      hasCenteredInitialLocationRef.current = true;
    }
  }, [location]);

  useEffect(() => {
    if (!mapReady || !window.google || !mapObj.current || !directionsRenderer.current) {
      return;
    }

    if (!location || !destination) {
      directionsRenderer.current.set("directions", null);

      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setMap(null);
        destinationMarkerRef.current = null;
      }

      lastRouteOriginRef.current = null;
      lastRouteDestinationRef.current = null;
      lastViewportDestinationRef.current = null;
      onStepsUpdate?.([]);
      return;
    }

    const currentOrigin = {
      lat: location.latitude,
      lng: location.longitude,
    };

    const currentDestination = {
      lat: destination.latitude,
      lng: destination.longitude,
    };

    const previousOrigin = lastRouteOriginRef.current;
    const previousDestination = lastRouteDestinationRef.current;

    const movedFromLastOrigin = previousOrigin
      ? calculateDistanceMeters(
          previousOrigin.lat,
          previousOrigin.lng,
          currentOrigin.lat,
          currentOrigin.lng
        )
      : Number.MAX_SAFE_INTEGER;

    const destinationMoved = previousDestination
      ? calculateDistanceMeters(
          previousDestination.lat,
          previousDestination.lng,
          currentDestination.lat,
          currentDestination.lng
        )
      : Number.MAX_SAFE_INTEGER;

    if (movedFromLastOrigin < 35 && destinationMoved < 5) {
      return;
    }

    lastRouteOriginRef.current = currentOrigin;
    lastRouteDestinationRef.current = currentDestination;

    const google = window.google;
    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: currentOrigin,
        destination: currentDestination,
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
          setErrorMessage(`Não foi possível calcular a rota (${status}).`);
          return;
        }

        setErrorMessage("");

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
        onStepsUpdate?.(getStepInstructions(bestRoute));

        if (!destinationMarkerRef.current) {
          destinationMarkerRef.current = new google.maps.Marker({
            position: currentDestination,
            map: mapObj.current,
            title: destination.name || "Destino",
          });
        } else {
          destinationMarkerRef.current.setPosition(currentDestination);
          destinationMarkerRef.current.setTitle(destination.name || "Destino");
          destinationMarkerRef.current.setMap(mapObj.current);
        }

        const destinationKey = `${currentDestination.lat}:${currentDestination.lng}`;
        if (lastViewportDestinationRef.current !== destinationKey && bestRoute.bounds) {
          mapObj.current?.fitBounds(bestRoute.bounds, 80);
          lastViewportDestinationRef.current = destinationKey;
        }
      }
    );
  }, [mapReady, location, destination, onStepsUpdate]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {loadingMap && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
            color: "#fff",
            zIndex: 2,
          }}
        >
          Carregando mapa...
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            background: "rgba(127,29,29,0.92)",
            color: "#fff",
            padding: "12px 14px",
            borderRadius: 12,
            zIndex: 3,
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}