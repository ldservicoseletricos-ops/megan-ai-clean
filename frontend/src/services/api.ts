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
  };
} | null;

export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) {
    throw new Error("Falha ao verificar backend");
  }
  return res.json();
}

export async function sendChatMessage(
  message: string,
  deviceLocation?: DeviceLocation,
  navigationPayload?: NavigationPayload
) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      deviceLocation: deviceLocation || null,
      navigationPayload: navigationPayload || null,
    }),
  });

  const data = await res.json();

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
  try {
    const res = await fetch(`${API_URL}/api/navigation/suggest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        deviceLocation: deviceLocation || null,
        sessionToken: sessionToken || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { suggestions: [] };
    }

    return data;
  } catch {
    return { suggestions: [] };
  }
}

export async function getNavigationQuickAccess() {
  try {
    const res = await fetch(`${API_URL}/api/navigation/quick-access`);
    const data = await res.json();

    if (!res.ok) {
      return { favorites: [], recent: [] };
    }

    return data;
  } catch {
    return { favorites: [], recent: [] };
  }
}

export async function resolveNavigationDestination(
  input: string,
  deviceLocation?: DeviceLocation,
  placeId?: string
) {
  try {
    const res = await fetch(`${API_URL}/api/navigation/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        deviceLocation: deviceLocation || null,
        placeId: placeId || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao resolver destino");
    }

    return data;
  } catch {
    return null;
  }
}