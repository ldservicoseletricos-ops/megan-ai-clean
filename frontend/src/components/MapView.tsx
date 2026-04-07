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

type LatLngPoint = {
  lat: number;
  lng: number;
};

type RouteSummary = {
  distanceText: string;
  distanceMeters: number;
  durationText: string;
  durationSeconds: number;
  trafficDurationText?: string;
  trafficDurationSeconds?: number;
  destinationLabel?: string;
};

type MapViewProps = {
  location: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    accuracy?: number | null;
  } | null;
  destination?: {
    latitude: number;
    longitude: number;
    name?: string;
  } | null;
  onStepsUpdate?: (steps: Step[]) => void;
  onRouteDataUpdate?: (summary: RouteSummary | null) => void;
  recenterSignal?: number;
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

function flattenOverviewPath(route: google.maps.DirectionsRoute): LatLngPoint[] {
  if (!route.overview_path?.length) return [];

  return route.overview_path.map((point) => ({
    lat: point.lat(),
    lng: point.lng(),
  }));
}

function buildRoutePolyline(
  google: typeof window.google,
  routePath: LatLngPoint[]
) {
  return new google.maps.Polyline({
    path: routePath,
  });
}

function isPointOnRoute(
  google: typeof window.google,
  point: LatLngPoint,
  routePath: LatLngPoint[],
  toleranceMeters: number
) {
  if (!routePath.length || !google.maps.geometry?.poly) return false;

  const polyline = buildRoutePolyline(google, routePath);

  return google.maps.geometry.poly.isLocationOnEdge(
    new google.maps.LatLng(point.lat, point.lng),
    polyline,
    toleranceMeters / 6378137
  );
}

function getDynamicToleranceMeters(
  speed?: number | null,
  accuracy?: number | null
) {
  const speedKmh =
    typeof speed === "number" && !Number.isNaN(speed) ? speed * 3.6 : 0;

  let tolerance = 28;

  if (speedKmh >= 20) tolerance = 35;
  if (speedKmh >= 50) tolerance = 45;
  if (speedKmh >= 80) tolerance = 55;

  if (typeof accuracy === "number" && !Number.isNaN(accuracy)) {
    tolerance = Math.max(tolerance, Math.min(accuracy * 1.4, 80));
  }

  return tolerance;
}

export default function MapView({
  location,
  destination,
  onStepsUpdate,
  onRouteDataUpdate,
  recenterSignal = 0,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);

  const initializedRef = useRef(false);
  const navigationReadyRef = useRef(false);

  const lastRouteAtRef = useRef(0);
  const offRouteStartedAtRef = useRef<number | null>(null);

  const lastRouteDestinationRef = useRef<LatLngPoint | null>(null);

  const routePathRef = useRef<LatLngPoint[]>([]);
  const animatedCenterRef = useRef<LatLngPoint | null>(null);
  const lastAnimatedAtRef = useRef(0);

  const lastLocationForHeadingRef = useRef<LatLngPoint | null>(null);
  const headingRef = useRef(0);
  const markerHeadingRef = useRef(0);

  const lastConfirmedOnRouteRef = useRef<LatLngPoint | null>(null);
  const offRouteSampleCountRef = useRef(0);

  const programmaticMoveRef = useRef(false);
  const suppressManualUntilRef = useRef(0);
  const followUserRef = useRef(true);

  const [mapReady, setMapReady] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRecenter, setShowRecenter] = useState(false);

  function setProgrammaticCenter(center: LatLngPoint) {
    if (!mapObj.current) return;
    programmaticMoveRef.current = true;
    suppressManualUntilRef.current = Date.now() + 1000;
    mapObj.current.panTo(center);
    animatedCenterRef.current = center;
    lastAnimatedAtRef.current = Date.now();

    window.setTimeout(() => {
      programmaticMoveRef.current = false;
    }, 250);
  }

  function focusNavigationCamera(
    current: LatLngPoint,
    heading = 0,
    speed?: number | null
  ) {
    if (!mapObj.current) return;

    const map = mapObj.current;

    followUserRef.current = true;
    setShowRecenter(false);
    suppressManualUntilRef.current = Date.now() + 1200;
    programmaticMoveRef.current = true;

    map.setCenter(current);
    map.setZoom(getNavigationZoom(speed ?? 0));

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
    lastAnimatedAtRef.current = Date.now();

    window.setTimeout(() => {
      programmaticMoveRef.current = false;
    }, 300);
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

        map.addListener("dragstart", () => {
          if (programmaticMoveRef.current) return;
          if (Date.now() < suppressManualUntilRef.current) return;
          if (!destination) return;

          followUserRef.current = false;
          setShowRecenter(true);
        });

        map.addListener("zoom_changed", () => {
          if (programmaticMoveRef.current) return;
          if (Date.now() < suppressManualUntilRef.current) return;
          if (!destination) return;

          followUserRef.current = false;
          setShowRecenter(true);
        });

        animatedCenterRef.current = center;
        lastLocationForHeadingRef.current = center;
        lastConfirmedOnRouteRef.current = center;
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
  }, [location, destination]);

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

    if (previousForHeading && movedSinceHeadingRef >= 5) {
      const rawBearing = calculateBearing(
        previousForHeading.lat,
        previousForHeading.lng,
        current.lat,
        current.lng
      );

      markerHeadingRef.current = smoothAngle(
        markerHeadingRef.current,
        rawBearing,
        0.35
      );

      headingRef.current = smoothAngle(headingRef.current, rawBearing, 0.18);
      lastLocationForHeadingRef.current = current;
    } else if (!previousForHeading) {
      lastLocationForHeadingRef.current = current;
    }

    if (originMarkerRef.current) {
      originMarkerRef.current.setPosition(current);
      originMarkerRef.current.setIcon(
        getCarSymbol(google, markerHeadingRef.current)
      );
    }

    const map = mapObj.current;
    const now = Date.now();

    if (!destination) {
      followUserRef.current = true;
      navigationReadyRef.current = false;
      setShowRecenter(false);
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

      onRouteDataUpdate?.(null);
      return;
    }

    const targetZoom = getNavigationZoom(location.speed);
    const currentZoom = map.getZoom() ?? targetZoom;

    if (followUserRef.current) {
      if (Math.abs(currentZoom - targetZoom) >= 1) {
        suppressManualUntilRef.current = Date.now() + 800;
        programmaticMoveRef.current = true;
        map.setZoom(targetZoom);
        window.setTimeout(() => {
          programmaticMoveRef.current = false;
        }, 200);
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

        const backwardOffsetLat = Math.cos(headingRad) * latSpan * 0.12;
        const backwardOffsetLng = Math.sin(headingRad) * lngSpan * 0.12;

        projectedTarget = {
          lat: current.lat - backwardOffsetLat,
          lng: current.lng - backwardOffsetLng,
        };
      }

      const previousCenter = animatedCenterRef.current || projectedTarget;
      const nextCenter = {
        lat: lerp(previousCenter.lat, projectedTarget.lat, 0.22),
        lng: lerp(previousCenter.lng, projectedTarget.lng, 0.22),
      };

      const movedCenter = calculateDistanceMeters(
        previousCenter.lat,
        previousCenter.lng,
        nextCenter.lat,
        nextCenter.lng
      );

      if (movedCenter >= 2 || now - lastAnimatedAtRef.current > 1100) {
        setProgrammaticCenter(nextCenter);
      }
    }
  }, [location, destination]);

  useEffect(() => {
    if (!recenterSignal || !location) return;

    const current = {
      lat: location.latitude,
      lng: location.longitude,
    };

    focusNavigationCamera(current, headingRef.current, location.speed);
  }, [recenterSignal, location]);

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

    const google = window.google;
    const now = Date.now();

    const currentOrigin: LatLngPoint = {
      lat: location.latitude,
      lng: location.longitude,
    };

    const currentDestination: LatLngPoint = {
      lat: destination.latitude,
      lng: destination.longitude,
    };

    const previousDestination = lastRouteDestinationRef.current;
    const destinationMoved = previousDestination
      ? calculateDistanceMeters(
          previousDestination.lat,
          previousDestination.lng,
          currentDestination.lat,
          currentDestination.lng
        )
      : Number.MAX_SAFE_INTEGER;

    const hasRoute = routePathRef.current.length > 0;
    const routeNotLoaded = !navigationReadyRef.current || !hasRoute;

    let shouldRecalculate = false;

    if (routeNotLoaded) {
      shouldRecalculate = true;
    }

    if (destinationMoved >= 5) {
      shouldRecalculate = true;
    }

    if (hasRoute && !shouldRecalculate) {
      const toleranceMeters = getDynamicToleranceMeters(
        location.speed,
        location.accuracy
      );

      const onRoute = isPointOnRoute(
        google,
        currentOrigin,
        routePathRef.current,
        toleranceMeters
      );

      if (onRoute) {
        offRouteStartedAtRef.current = null;
        offRouteSampleCountRef.current = 0;
        lastConfirmedOnRouteRef.current = currentOrigin;
      } else {
        if (!offRouteStartedAtRef.current) {
          offRouteStartedAtRef.current = now;
          offRouteSampleCountRef.current = 1;
        } else {
          offRouteSampleCountRef.current += 1;
        }

        const offRouteDuration = now - offRouteStartedAtRef.current;
        const referencePoint = lastConfirmedOnRouteRef.current;
        const driftFromLastGoodPoint = referencePoint
          ? calculateDistanceMeters(
              referencePoint.lat,
              referencePoint.lng,
              currentOrigin.lat,
              currentOrigin.lng
            )
          : 0;

        const minDurationMs =
          typeof location.speed === "number" && location.speed * 3.6 > 50
            ? 3500
            : 4500;

        const minSamples = 3;
        const minDriftMeters =
          typeof location.accuracy === "number" && !Number.isNaN(location.accuracy)
            ? Math.max(30, location.accuracy * 1.3)
            : 35;

        const confirmedOffRoute =
          offRouteDuration >= minDurationMs &&
          offRouteSampleCountRef.current >= minSamples &&
          driftFromLastGoodPoint >= minDriftMeters;

        if (confirmedOffRoute) {
          const cooldownPassed = now - lastRouteAtRef.current >= 9000;
          if (cooldownPassed) {
            shouldRecalculate = true;
          }
        }
      }
    }

    if (!shouldRecalculate) {
      return;
    }

    lastRouteAtRef.current = now;
    lastRouteDestinationRef.current = currentDestination;

    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: currentOrigin,
        destination: currentDestination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        if (status !== "OK" || !result || !result.routes?.length) {
          console.error("Erro ao calcular rota:", status, result);
          setErrorMessage(`Não foi possível calcular a rota (${status}).`);
          onRouteDataUpdate?.(null);
          return;
        }

        setErrorMessage("");

        directionsRenderer.current?.setDirections(result);
        directionsRenderer.current?.setRouteIndex(0);

        const bestRoute = result.routes[0];
        const bestLeg = bestRoute?.legs?.[0];

        if (!bestLeg) return;

        routePathRef.current = flattenOverviewPath(bestRoute);

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

        focusNavigationCamera(currentOrigin, headingRef.current, location.speed);

        navigationReadyRef.current = true;
        offRouteStartedAtRef.current = null;
        offRouteSampleCountRef.current = 0;
        lastConfirmedOnRouteRef.current = currentOrigin;

        onRouteDataUpdate?.({
          distanceText: bestLeg.distance?.text || "--",
          distanceMeters: Number(bestLeg.distance?.value || 0),
          durationText: bestLeg.duration?.text || "--",
          durationSeconds: Number(bestLeg.duration?.value || 0),
          trafficDurationText: bestLeg.duration_in_traffic?.text || undefined,
          trafficDurationSeconds: bestLeg.duration_in_traffic?.value
            ? Number(bestLeg.duration_in_traffic.value)
            : undefined,
          destinationLabel: destination.name || "Destino",
        });

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
  }, [mapReady, location, destination, onStepsUpdate, onRouteDataUpdate]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#f3f4f6",
      }}
    >
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "100%",
          background: "#e5e7eb",
        }}
      />

      {loadingMap && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.82)",
            color: "#111827",
            fontSize: 16,
            fontWeight: 700,
            backdropFilter: "blur(3px)",
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
            top: 16,
            zIndex: 4,
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
            background: "rgba(255,255,255,0.92)",
            color: "#111827",
            padding: 24,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          Configure VITE_GOOGLE_MAPS_API_KEY no frontend para usar o Google Maps.
        </div>
      )}

      {showRecenter && destination && (
        <button
          onClick={() => {
            if (!location) return;
            focusNavigationCamera(
              { lat: location.latitude, lng: location.longitude },
              headingRef.current,
              location.speed
            );
          }}
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            zIndex: 5,
            background: "rgba(17,24,39,0.94)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: "12px 14px",
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          Recentralizar
        </button>
      )}
    </div>
  );
}