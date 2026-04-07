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
  locationType?: string;
  partialMatch?: boolean;
};

declare global {
  interface Window {
    google?: typeof google;
    __meganGooglePromise?: Promise<typeof google>;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-script";

export function loadGoogleMapsScript(): Promise<typeof google> {
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry,places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = handleLoad;
    script.onerror = handleError;

    document.head.appendChild(script);
  });

  return window.__meganGooglePromise;
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function stripNavigationIntent(input: string) {
  return String(input || "")
    .replace(/^navegar para\s+/i, "")
    .replace(/^navegar pra\s+/i, "")
    .replace(/^ir para\s+/i, "")
    .replace(/^ir pra\s+/i, "")
    .replace(/^rota para\s+/i, "")
    .replace(/^rota pra\s+/i, "")
    .replace(/^me leve para\s+/i, "")
    .replace(/^levar para\s+/i, "")
    .trim();
}

function looksLikePreciseAddress(input: string) {
  const normalized = normalizeText(input);

  return (
    /\b\d{1,6}\b/.test(normalized) ||
    normalized.includes("rua ") ||
    normalized.includes("avenida ") ||
    normalized.includes("av ") ||
    normalized.includes("estrada ") ||
    normalized.includes("rodovia ") ||
    normalized.includes("travessa ") ||
    normalized.includes("alameda ") ||
    normalized.includes("praca ") ||
    normalized.includes("praça ") ||
    normalized.includes("bairro ") ||
    normalized.includes("centro ") ||
    normalized.includes("cep ")
  );
}

function buildBounds(
  googleMaps: typeof google,
  deviceLocation?: DeviceLocation,
  radiusDegrees = 0.18
) {
  if (!deviceLocation) return undefined;

  const center = new googleMaps.maps.LatLng(
    deviceLocation.latitude,
    deviceLocation.longitude
  );

  return new googleMaps.maps.LatLngBounds(
    {
      lat: center.lat() - radiusDegrees,
      lng: center.lng() - radiusDegrees,
    },
    {
      lat: center.lat() + radiusDegrees,
      lng: center.lng() + radiusDegrees,
    }
  );
}

function createPlacesService(googleMaps: typeof google) {
  const container = document.createElement("div");
  return new googleMaps.maps.places.PlacesService(container);
}

function geocodeRequest(
  geocoder: google.maps.Geocoder,
  request: google.maps.GeocoderRequest
) {
  return new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
    geocoder.geocode(
      request,
      (results: google.maps.GeocoderResult[] | null, status) => {
        if (status === "OK" && Array.isArray(results) && results.length > 0) {
          resolve(results);
          return;
        }

        reject(new Error(`Geocoder falhou: ${status}`));
      }
    );
  });
}

function autocompleteRequest(
  service: google.maps.places.AutocompleteService,
  request: google.maps.places.AutocompletionRequest
) {
  return new Promise<google.maps.places.AutocompletePrediction[]>(
    (resolve, reject) => {
      service.getPlacePredictions(
        request,
        (
          predictions: google.maps.places.AutocompletePrediction[] | null,
          status
        ) => {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            Array.isArray(predictions)
          ) {
            resolve(predictions);
            return;
          }

          if (
            status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS ||
            !predictions?.length
          ) {
            resolve([]);
            return;
          }

          reject(new Error(`Autocomplete falhou: ${status}`));
        }
      );
    }
  );
}

function placeDetailsRequest(
  service: google.maps.places.PlacesService,
  request: google.maps.places.PlaceDetailsRequest
) {
  return new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
    service.getDetails(
      request,
      (place: google.maps.places.PlaceResult | null, status) => {
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          place?.geometry?.location
        ) {
          resolve(place);
          return;
        }

        reject(new Error(`Place details falhou: ${status}`));
      }
    );
  });
}

function mapGeocoderResult(
  result: google.maps.GeocoderResult,
  source: string
): DestinationResult | null {
  const location = result.geometry?.location;
  if (!location) return null;

  return {
    latitude: location.lat(),
    longitude: location.lng(),
    name:
      result.address_components?.[0]?.long_name ||
      result.formatted_address ||
      "Destino",
    address: result.formatted_address || "Destino",
    formattedAddress: result.formatted_address || "Destino",
    placeId: result.place_id || "",
    source,
    locationType: result.geometry?.location_type || "",
    partialMatch: Boolean(result.partial_match),
  };
}

function mapPlaceResult(
  place: google.maps.places.PlaceResult,
  source: string
): DestinationResult | null {
  const location = place.geometry?.location;
  if (!location) return null;

  return {
    latitude: location.lat(),
    longitude: location.lng(),
    name: place.name || place.formatted_address || "Destino",
    address: place.formatted_address || place.name || "Destino",
    formattedAddress: place.formatted_address || place.name || "Destino",
    placeId: place.place_id || "",
    source,
  };
}

export async function resolveDestinationWithGoogleMaps(
  input: string,
  deviceLocation?: DeviceLocation,
  placeId?: string
): Promise<DestinationResult | null> {
  try {
    const query = stripNavigationIntent(input);
    if (!query && !placeId) return null;

    const googleMaps = await loadGoogleMapsScript();
    const geocoder = new googleMaps.maps.Geocoder();
    const placesService = createPlacesService(googleMaps);

    if (placeId) {
      try {
        const place = await placeDetailsRequest(placesService, {
          placeId,
          fields: ["name", "formatted_address", "geometry", "place_id"],
        });

        const resolved = mapPlaceResult(place, "place_details");
        if (resolved) return resolved;
      } catch {
      }
    }

    const isPreciseAddress = looksLikePreciseAddress(query);

    if (isPreciseAddress) {
      try {
        const bounds = buildBounds(googleMaps, deviceLocation);
        const geocodeResults = await geocodeRequest(geocoder, {
          address: query,
          bounds,
          region: "br",
        });

        const resolved = mapGeocoderResult(geocodeResults[0], "geocoder");
        if (resolved) return resolved;
      } catch {
      }
    }

    try {
      const autocomplete = new googleMaps.maps.places.AutocompleteService();
      const predictions = await autocompleteRequest(autocomplete, {
        input: query,
        bounds: buildBounds(googleMaps, deviceLocation),
        componentRestrictions: { country: "br" },
        language: "pt-BR",
      });

      if (predictions.length > 0) {
        const firstPrediction = predictions[0];

        const place = await placeDetailsRequest(placesService, {
          placeId: firstPrediction.place_id,
          fields: ["name", "formatted_address", "geometry", "place_id"],
        });

        const resolved = mapPlaceResult(place, "autocomplete");
        if (resolved) return resolved;
      }
    } catch {
    }

    try {
      const geocodeResults = await geocodeRequest(geocoder, {
        address: query,
        region: "br",
      });

      const resolved = mapGeocoderResult(geocodeResults[0], "geocoder_fallback");
      if (resolved) return resolved;
    } catch {
    }

    return null;
  } catch (error) {
    console.error("Erro ao resolver destino com Google Maps:", error);
    return null;
  }
}