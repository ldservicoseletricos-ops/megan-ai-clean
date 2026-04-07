type DestinationPayload = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  formattedAddress?: string;
} | null;

type SendLocationPayload = {
  latitude: number;
  longitude: number;
  speed?: number | null;
  destination?: DestinationPayload;
};

type DrivingResponse = {
  ok?: boolean;
  alert?: string | null;
  distance?: string;
  eta?: string;
  error?: string;
};

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:10000";

export async function sendLocationToBackend(
  payload: SendLocationPayload
): Promise<DrivingResponse> {
  const res = await fetch(`${API_URL}/api/driving`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
      speed:
        typeof payload.speed === "number" && !Number.isNaN(payload.speed)
          ? payload.speed
          : null,
      destination: payload.destination
        ? {
            latitude: Number(payload.destination.latitude),
            longitude: Number(payload.destination.longitude),
            name: payload.destination.name || "Destino",
            address: payload.destination.address || "",
            formattedAddress: payload.destination.formattedAddress || "",
          }
        : null,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao enviar localização para o backend");
  }

  return {
    ok: true,
    alert: data?.alert || null,
    distance: data?.distance || "--",
    eta: data?.eta || "--",
  };
}