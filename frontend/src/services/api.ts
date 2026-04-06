import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error("VITE_API_URL não configurado");
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export async function checkHealth() {
  const { data } = await api.get("/api/health");
  return data;
}

export async function sendChatMessage(
  message: string,
  deviceLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null
) {
  const payload = {
    message,
    deviceLocation: deviceLocation
      ? {
          latitude: Number(deviceLocation.latitude),
          longitude: Number(deviceLocation.longitude),
          accuracy:
            typeof deviceLocation.accuracy === "number"
              ? deviceLocation.accuracy
              : null,
        }
      : null,
  };

  console.log("sendChatMessage payload:", payload);

  const { data } = await api.post("/api/chat", payload);

  return data;
}

export async function resolveNavigationDestination(message: string) {
  const { data } = await api.post("/api/navigation/resolve", {
    message,
  });

  return data;
}

export async function suggestNavigation(
  input: string,
  deviceLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null,
  sessionToken: string
) {
  const payload = {
    input,
    sessionToken,
    deviceLocation: deviceLocation
      ? {
          latitude: Number(deviceLocation.latitude),
          longitude: Number(deviceLocation.longitude),
          accuracy:
            typeof deviceLocation.accuracy === "number"
              ? deviceLocation.accuracy
              : null,
        }
      : null,
  };

  const { data } = await api.post("/api/navigation/suggest", payload);
  return data;
}