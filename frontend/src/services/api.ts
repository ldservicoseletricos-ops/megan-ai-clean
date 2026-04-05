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

/* =========================
   HEALTH CHECK
========================= */
export async function checkHealth() {
  const { data } = await api.get("/api/health");
  return data;
}

/* =========================
   CHAT
========================= */
export async function sendChatMessage(message: string) {
  const { data } = await api.post("/api/chat", {
    message,
  });

  return data;
}