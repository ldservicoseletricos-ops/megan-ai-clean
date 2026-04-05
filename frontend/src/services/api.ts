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
  const { data } = await api.post("/api/chat", {
    message,
    deviceLocation,
  });

  return data;
}