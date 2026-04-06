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
    speed?: number | null;
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

function lerp(start: number, end: number, factor: number) {
  return start + (end - start) * factor;
}

function normalizeAngle(angle: number) {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function shortestAngleDelta(from: number, to: number) {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function smoothAngle(from: number, to: number, factor: number) {
  return normalizeAngle(from + shortestAngleDelta(from, to) * factor);
}

function getNavigationZoom(speed?: number | null) {
  const speedKmh =
    typeof speed === "number" && !Number.isNaN(speed) ? speed * 3.6 : 0;

  if (speedKmh >= 90) return 16;
  if (speedKmh >= 60) return 17;
  if (speedKmh >= 25) return 18;
  return 19;
}

function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lng1 * Math.PI) / 180;
  const lambda2 = (lng2 * Math.PI) / 180;

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  const theta = Math.atan2(y, x);
  return normalizeAngle((theta * 180) / Math.PI);
}

function getCarSymbol(
  google: typeof window.google,
  rotation: number
): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 7,
    rotation,
    fillColor: "#2563eb",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    anchor: new google.maps.Point(0, 2),
  };
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
  const navigationReadyRef = useRef(false);

  const lastRouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteDestinationRef = useRef<{ lat: number; lng: number } | null>(null);

  const animatedCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastAnimatedAtRef = useRef(0);

  const lastLocationForHeadingRef = useRef<{ lat: number; lng: number } | null>(null);
  const headingRef = useRef(0);
  const markerHeadingRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  function focusNavigationCamera(
    current: { lat: number; lng: number },
    heading = 0,
    speed?: number | null
  ) {
    if (!mapObj.current) return;

    const map = mapObj.current;
    const zoom = getNavigationZoom(speed);

    map.setCenter(current);
    map.setZoom(zoom);

    if (typeof map.setTilt === "function") {
      try {
        map.setTilt(45);
      } catch {
        // ignore
      }
    }

    if (typeof map.setHeading === "function") {
      try {
        map.setHeading(heading);
      } catch {
        // ignore
      }
    }

    animatedCenterRef.current = current;
  }

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
          zoom: 18,
          tilt: 0,
          heading: 0,
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
            strokeColor: "#2563eb",
            strokeOpacity: 0.95,
            strokeWeight: 7,
          },
        });

        originMarkerRef.current = new google.maps.Marker({
          position: center,
          map,
          title: "Você",
          icon: getCarSymbol(google, 0),
          zIndex: 999,
        });

        animatedCenterRef.current = center;
        lastLocationForHeadingRef.current = center;
        initializedRef.current = true;
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
    if (!location || !mapObj.current || !window.google) return;

    const google = window.google;
    const current = {
      lat: location.latitude,
      lng: location.longitude,
    };

    const previousForHeading = lastLocationForHeadingRef.current;
    const movedSinceHeadingRef = previousForHeading
      ? calculateDistanceMeters(
          previousForHeading.lat,
          previousForHeading.lng,
          current.lat,
          current.lng
        )
      : 0;

    if (previousForHeading && movedSinceHeadingRef >= 4) {
      const rawBearing = calculateBearing(
        previousForHeading.lat,
        previousForHeading.lng,
        current.lat,
        current.lng
      );

      markerHeadingRef.current = smoothAngle(
        markerHeadingRef.current,
        rawBearing,
        0.45
      );

      headingRef.current = smoothAngle(headingRef.current, rawBearing, 0.22);
      lastLocationForHeadingRef.current = current;
    } else if (!previousForHeading) {
      lastLocationForHeadingRef.current = current;
    }

    if (originMarkerRef.current) {
      originMarkerRef.current.setPosition(current);
      originMarkerRef.current.setIcon(getCarSymbol(google, markerHeadingRef.current));
    }

    const map = mapObj.current;
    const now = Date.now();

    if (!destination) {
      navigationReadyRef.current = false;
      animatedCenterRef.current = current;
      map.setCenter(current);

      if ((map.getZoom() ?? 18) !== 18) {
        map.setZoom(18);
      }

      if (typeof map.setHeading === "function") {
        try {
          map.setHeading(0);
        } catch {
          // ignore
        }
      }

      if (typeof map.setTilt === "function") {
        try {
          map.setTilt(0);
        } catch {
          // ignore
        }
      }

      return;
    }

    const targetZoom = getNavigationZoom(location.speed);
    const currentZoom = map.getZoom() ?? targetZoom;

    if (Math.abs(currentZoom - targetZoom) >= 1) {
      map.setZoom(targetZoom);
    }

    if (typeof map.setTilt === "function") {
      try {
        map.setTilt(45);
      } catch {
        // ignore
      }
    }

    if (typeof map.setHeading === "function") {
      try {
        map.setHeading(headingRef.current);
      } catch {
        // ignore
      }
    }

    const bounds = map.getBounds();
    let projectedTarget = current;

    if (bounds) {
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const latSpan = Math.abs(ne.lat() - sw.lat());
      const lngSpan = Math.abs(ne.lng() - sw.lng());

      const headingRad = (headingRef.current * Math.PI) / 180;

      const backwardOffsetLat = Math.cos(headingRad) * latSpan * 0.14;
      const backwardOffsetLng = Math.sin(headingRad) * lngSpan * 0.14;

      projectedTarget = {
        lat: current.lat - backwardOffsetLat,
        lng: current.lng - backwardOffsetLng,
      };
    }

    const previousCenter = animatedCenterRef.current || projectedTarget;
    const nextCenter = {
      lat: lerp(previousCenter.lat, projectedTarget.lat, 0.32),
      lng: lerp(previousCenter.lng, projectedTarget.lng, 0.32),
    };

    const movedCenter = calculateDistanceMeters(
      previousCenter.lat,
      previousCenter.lng,
      nextCenter.lat,
      nextCenter.lng
    );

    if (movedCenter >= 1.2 || now - lastAnimatedAtRef.current > 850) {
      map.panTo(nextCenter);
      animatedCenterRef.current = nextCenter;
      lastAnimatedAtRef.current = now;
    }
  }, [location, destination]);

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

    const movedDestination = previousDestination
      ? calculateDistanceMeters(
          previousDestination.lat,
          previousDestination.lng,
          currentDestination.lat,
          currentDestination.lng
        )
      : Number.MAX_SAFE_INTEGER;

    if (movedFromLastOrigin < 35 && movedDestination < 5) {
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
          destinationMarkerRef.current.setTitle(destination.name || "Destino");
          destinationMarkerRef.current.setMap(mapObj.current);
        }

        if (!navigationReadyRef.current) {
          focusNavigationCamera(currentOrigin, headingRef.current, location.speed);
          navigationReadyRef.current = true;
        }

        const steps: Step[] = bestLeg.steps.map((step) => ({
          instruction: step.instructions.replace(/<[^>]+>/g, ""),
          end_location: {
            lat: step.end_location.lat(),
            lng: step.end_location.lng(),
          },
        }));

        onStepsUpdate?.(steps);
      }
    );
  }, [mapReady, location, destination, onStepsUpdate]);

  useEffect(() => {
    if (!destination) {
      navigationReadyRef.current = false;
      lastRouteOriginRef.current = null;
      lastRouteDestinationRef.current = null;
      animatedCenterRef.current = null;
      lastLocationForHeadingRef.current = location
        ? { lat: location.latitude, lng: location.longitude }
        : null;
      headingRef.current = 0;
      markerHeadingRef.current = 0;

      if (directionsRenderer.current) {
        directionsRenderer.current.set("directions", null);
      }

      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setMap(null);
        destinationMarkerRef.current = null;
      }

      if (originMarkerRef.current && window.google?.maps) {
        originMarkerRef.current.setIcon(getCarSymbol(window.google, 0));
      }

      if (mapObj.current) {
        if (typeof mapObj.current.setHeading === "function") {
          try {
            mapObj.current.setHeading(0);
          } catch {
            // ignore
          }
        }

        if (typeof mapObj.current.setTilt === "function") {
          try {
            mapObj.current.setTilt(0);
          } catch {
            // ignore
          }
        }
      }
    }
  }, [destination, location]);

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
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 3,
            background: "rgba(127,29,29,0.95)",
            color: "#fff",
            padding: 14,
            borderRadius: 12,
            textAlign: "center",
            fontSize: 14,
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