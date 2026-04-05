export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface ChatApiResponse {
  ok?: boolean;
  reply?: string;
  message?: string;
  response?: string;
}