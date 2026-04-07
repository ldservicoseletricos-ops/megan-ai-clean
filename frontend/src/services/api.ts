const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:10000";

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
} | null;

type NavigationPayload = {
  placeId?: string;
  destination?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    formattedAddress?: string;
    source?: string;
    placeId?: string;
    locationType?: string;
    partialMatch?: boolean;
  } | null;
} | null;

function buildJsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

async function readJsonSafe(res: Response) {
  const text = await res.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`);
  const data = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(data?.error || "Falha ao verificar backend");
  }

  return data;
}

export async function sendChatMessage(
  message: string,
  deviceLocation?: DeviceLocation,
  navigationPayload?: NavigationPayload
) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      message,
      deviceLocation: deviceLocation || null,
      navigationPayload: navigationPayload || null,
    }),
  });

  const data = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao enviar mensagem");
  }

  return data;
}

export async function suggestNavigation(
  input: string,
  deviceLocation?: DeviceLocation,
  sessionToken?: string
) {
  const res = await fetch(`${API_URL}/api/navigation/suggest`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      input,
      deviceLocation: deviceLocation || null,
      sessionToken: sessionToken || null,
    }),
  });

  const data = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao buscar sugestões");
  }

  return data;
}

export async function getNavigationQuickAccess() {
  const res = await fetch(`${API_URL}/api/navigation/quick-access`);
  const data = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao buscar atalhos");
  }

  return data;
}

export async function resolveNavigationDestination(
  input: string,
  deviceLocation?: DeviceLocation,
  placeId?: string
) {
  const res = await fetch(`${API_URL}/api/navigation/resolve`, {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({
      input,
      deviceLocation: deviceLocation || null,
      placeId: placeId || null,
    }),
  });

  const data = await readJsonSafe(res);

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao resolver destino");
  }

  return data;
}
