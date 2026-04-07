const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
} | null;

type DestinationResult = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  formattedAddress?: string;
  source?: string;
  placeId?: string;
};

declare global {
  interface Window {
    google?: any;
    __meganGooglePromise?: Promise<any>;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-script";

export function loadGoogleMapsScript(): Promise<any> {
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (window.__meganGooglePromise) {
    return window.__meganGooglePromise;
  }

  window.__meganGooglePromise = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("VITE_GOOGLE_MAPS_API_KEY nao configurada"));
      return;
    }

    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID
    ) as HTMLScriptElement | null;

    const handleLoad = () => {
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps carregou incompleto"));
      }
    };

    const handleError = () => {
      reject(new Error("Falha ao carregar Google Maps"));
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });

      if (window.google?.maps?.places) {
        resolve(window.google);
      }

      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = handleLoad;
    script.onerror = handleError;

    document.head.appendChild(script);
  });

  return window.__meganGooglePromise;
}

function stripNavigationIntent(input: string) {
  return String(input || "")
    .replace(/^navegar para\s+/i, "")
    .replace(/^ir para\s+/i, "")
    .replace(/^rota para\s+/i, "")
    .trim();
}

export async function resolveDestinationWithGoogleMaps(
  input: string,
  deviceLocation?: DeviceLocation,
  placeId?: string
): Promise<DestinationResult | null> {
  try {
    const query = stripNavigationIntent(input);
    if (!query) return null;

    const googleMaps = await loadGoogleMapsScript();

    const geocoder = new googleMaps.maps.Geocoder();

    const results = await new Promise<any[]>((resolve, reject) => {
      geocoder.geocode(
        { address: query },
        (res: any, status: string) => {
          if (status === "OK" && res?.length) resolve(res);
          else reject(status);
        }
      );
    });

    const result = results[0];

    return {
      latitude: result.geometry.location.lat(),
      longitude: result.geometry.location.lng(),
      name: result.formatted_address,
      address: result.formatted_address,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      source: "geocoder",
    };
  } catch (error) {
    console.error("Erro Google Maps:", error);
    return null;
  }
}