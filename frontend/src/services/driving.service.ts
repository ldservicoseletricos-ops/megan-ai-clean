type DrivingLocationPayload = {
  latitude: number;
  longitude: number;
  speed?: number | null;
  destination?: {
    latitude: number;
    longitude: number;
    name?: string;
  } | null;
};

type DrivingResponse = {
  ok: boolean;
  alert?: string | null;
  distance?: string;
  eta?: string;
  error?: string;
};

export async function sendLocationToBackend(
  payload: DrivingLocationPayload
): Promise<DrivingResponse> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/driving`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao enviar localização para o backend");
  }

  return data;
}