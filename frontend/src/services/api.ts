import axios from "axios";
import type { ChatApiResponse } from "../types/chat";

const API_URL = import.meta.env.VITE_API_URL?.trim();

if (!API_URL) {
  throw new Error("VITE_API_URL não configurado no frontend.");
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

export async function checkHealth() {
  const response = await api.get("/api/health");
  return response.data;
}

export async function sendChatMessage(message: string): Promise<ChatApiResponse> {
  const response = await api.post("/api/chat", { message });
  return response.data;
}