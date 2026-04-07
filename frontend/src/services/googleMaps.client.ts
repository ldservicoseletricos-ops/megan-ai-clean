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

export async function resolveDestinationWithGoogleMaps(
  input: string,
  _deviceLocation?: DeviceLocation,
  _placeId?: string
): Promise<DestinationResult | null> {
  const text = String(input || "").trim();

  if (!text) {
    return null;
  }

  return null;
}