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

type LatLngLike = {
  lat: number;
  lng: number;
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MIN_ROUTE_REFRESH_DISTANCE_METERS = 35;
const MIN_ROUTE_REFRESH_INTERVAL_MS = 20000;

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

function arePointsDifferent(a?: LatLngLike | null, b?: LatLngLike | null) {
  if (!a && !b) return false;
  if (!a || !b) return true;

  return (
    Math.abs(a.lat - b.lat) > 0.000001 ||
    Math.abs(a.lng - b.lng) > 0.000001
  );
}

function clearDirections(renderer: google.maps.DirectionsRenderer | null) {
  if (!renderer) return;

  try {
    renderer.set("directions", null);
  } catch {
    // ignore
  }
}

export default function MapView({
  location,
  destination,
  onStepsUpdate,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);

  const initializedRef = useRef(false);
  const routeViewportKeyRef = useRef<string>("");
  const isRoutingRef = useRef(false);
  const lastRoutedOriginRef = useRef<LatLngLike | null>(null);
  const lastRoutedDestinationRef = useRef<LatLngLike | null>(null);
  const lastRouteUpdateRef = useRef(0);

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
        });

        mapObj.current = map;
        directionsServiceRef.current = new google.maps.DirectionsService();

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
        setLoadingMap(false);
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

    if (!initializedRef.current) {
      mapObj.current.setCenter(current);
    }
  }, [location]);

  useEffect(() => {
    if (!destination) {
      routeViewportKeyRef.current = "";
      lastRoutedDestinationRef.current = null;
      lastRoutedOriginRef.current = null;
      lastRouteUpdateRef.current = 0;
      setErrorMessage("");

      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setMap(null);
        destinationMarkerRef.current = null;
      }

      clearDirections(directionsRenderer.current);

      if (onStepsUpdate) {
        onStepsUpdate([]);
      }
    }
  }, [destination, onStepsUpdate]);

  useEffect(() => {
    if (
      !mapReady ||
      !location ||
      !destination ||
      !window.google ||
      !mapObj.current ||
      !directionsRenderer.current ||
      !directionsServiceRef.current ||
      isRoutingRef.current
    ) {
      return;
    }

    const google = window.google;

    const currentOrigin = {
      lat: location.latitude,
      lng: location.longitude,
    };

    const currentDestination = {
      lat: destination.latitude,
      lng: destination.longitude,
    };

    const destinationChanged = arePointsDifferent(
      lastRoutedDestinationRef.current,
      currentDestination
    );

    let movedEnough = false;

    if (
      lastRoutedOriginRef.current &&
      google.maps.geometry?.spherical?.computeDistanceBetween
    ) {
      const distanceMoved = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(
          lastRoutedOriginRef.current.lat,
          lastRoutedOriginRef.current.lng
        ),
        new google.maps.LatLng(currentOrigin.lat, currentOrigin.lng)
      );

      movedEnough = distanceMoved >= MIN_ROUTE_REFRESH_DISTANCE_METERS;
    } else {
      movedEnough = true;
    }

    const enoughTimePassed =
      Date.now() - lastRouteUpdateRef.current >= MIN_ROUTE_REFRESH_INTERVAL_MS;

    const shouldCalculateRoute =
      destinationChanged ||
      !lastRoutedOriginRef.current ||
      (!destinationChanged && movedEnough && enoughTimePassed);

    if (!shouldCalculateRoute) {
      return;
    }

    isRoutingRef.current = true;

    directionsServiceRef.current.route(
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
        isRoutingRef.current = false;

        if (status !== "OK" || !result || !result.routes?.length) {
          console.error("Erro ao calcular rota:", status, result);

          if (!lastRoutedDestinationRef.current) {
            setErrorMessage(`Não foi possível calcular a rota (${status}).`);
          }

          return;
        }

        setErrorMessage("");
        lastRouteUpdateRef.current = Date.now();
        lastRoutedOriginRef.current = currentOrigin;
        lastRoutedDestinationRef.current = currentDestination;

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

        const viewportKey = `${destinationPosition.lat.toFixed(6)}:${destinationPosition.lng.toFixed(6)}`;

        if (routeViewportKeyRef.current !== viewportKey) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(currentOrigin);
          bounds.extend(destinationPosition);
          mapObj.current.fitBounds(bounds);
          routeViewportKeyRef.current = viewportKey;
        }

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
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {loadingMap && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Carregando mapa...
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
            color: "#fff",
            padding: 24,
            textAlign: "center",
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.5,
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
            zIndex: 4,
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