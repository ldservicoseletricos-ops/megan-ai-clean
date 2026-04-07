const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:10000";

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
} | null;

/* =========================
   🔥 RESOLVE DESTINO VIA BACKEND
========================= */
export async function resolveNavigationDestination(
  input: string,
  deviceLocation?: DeviceLocation
) {
  try {
    const res = await fetch(`${API_URL}/api/navigation/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        deviceLocation,
      }),
    });

    const data = await res.json();

    if (!res.ok) return null;

    return data;
  } catch {
    return null;
  }
}

/* =========================
   CHAT
========================= */
export async function sendChatMessage(
  message: string,
  deviceLocation?: DeviceLocation
) {
  /* 🔥 PRIMEIRO tenta resolver destino */
  const resolved = await resolveNavigationDestination(
    message,
    deviceLocation
  );

  let navigationPayload = null;

  if (resolved?.destination) {
    navigationPayload = {
      destination: resolved.destination,
    };
  }

  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      deviceLocation,
      navigationPayload,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Erro no chat");
  }

  return data;
}