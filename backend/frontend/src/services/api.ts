export type MeganMode = "geral" | "livro" | "negocios" | "automacao";

export type User = {
  id?: string | number;
  name?: string | null;
  email?: string;
  plan?: string;
  externalId?: string | number;
};

export type Session = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export type UploadedFile = {
  id?: string;
  name?: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  url?: string | null;
  created_at?: string;
};

export type ChatMemoryPayload = {
  used?: number;
  updated?: number;
};

export type ProjectMemoryPayload = {
  project?: string | null;
  category?: string | null;
  status?: string | null;
  objective?: string | null;
  problem?: string | null;
  nextStep?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, any>;
  created_at?: string;
};

export type AuthResponse = {
  ok?: boolean;
  token?: string;
  user?: User;
  message?: string;
  error?: string;
};

export type SessionListResponse = {
  ok: boolean;
  sessions: Session[];
};

export type SessionMessagesResponse = {
  ok: boolean;
  session: Session;
  messages: ChatMessage[];
};

export type ChatResponse = {
  ok: boolean;
  sessionId: string;
  message: ChatMessage;
  savedUserMessage?: ChatMessage;
  files?: UploadedFile[];
  memory?: ChatMemoryPayload;
  projectMemory?: ProjectMemoryPayload;
  mode?: MeganMode;
  error?: string;
};

export type StreamMeta = {
  sessionId?: string;
  intent?: string;
  fileMode?: string | null;
  files?: UploadedFile[];
  weather?: any;
  transit?: any;
  imageForVision?: any;
  aiAvailable?: boolean;
  mode?: MeganMode;
};

export type StreamDonePayload = ChatResponse & {
  intent?: string;
  fileMode?: string | null;
  weather?: any;
  transit?: any;
  imageForVision?: any;
  aiAvailable?: boolean;
};

export const TOKEN_KEY = "megan_token";
export const USER_KEY = "megan_user";
export const MODE_KEY = "megan_mode";

function normalizeApiUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export const API_URL = normalizeApiUrl(
  (import.meta as any).env?.VITE_API_URL || "https://megan-ai.onrender.com"
);

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function getStoredMode(): MeganMode {
  const raw = (localStorage.getItem(MODE_KEY) || "geral").trim() as MeganMode;
  if (
    raw === "geral" ||
    raw === "livro" ||
    raw === "negocios" ||
    raw === "automacao"
  ) {
    return raw;
  }
  return "geral";
}

export function setStoredMode(mode: MeganMode) {
  localStorage.setItem(MODE_KEY, mode);
}

export function setStoredSession(token?: string, user?: User | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function buildAssetUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const authToken = token || getToken();

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || "Não foi possível concluir a requisição."
    );
  }

  return data as T;
}

type StreamChatOptions = {
  message: string;
  sessionId?: string;
  files?: File[];
  mode?: MeganMode;
  onMeta?: (meta: StreamMeta) => void;
  onToken?: (token: string) => void;
  onDone?: (payload: StreamDonePayload) => void;
};

export async function streamChatRequest(options: StreamChatOptions) {
  const token = getToken();

  if (!token) {
    throw new Error("Usuário não autenticado.");
  }

  const formData = new FormData();
  formData.append("message", options.message);

  if (options.sessionId) {
    formData.append("sessionId", options.sessionId);
  }

  if (options.mode) {
    formData.append("mode", options.mode);
  }

  for (const file of options.files || []) {
    formData.append("files", file);
  }

  const response = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    credentials: "include",
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    let data: any = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    throw new Error(
      data?.error || data?.message || "Não foi possível iniciar o stream."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  function parseEventBlock(block: string) {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const rawData = dataLines.join("\n");
    let parsedData: any = rawData;

    try {
      parsedData = rawData ? JSON.parse(rawData) : {};
    } catch {
      parsedData = rawData;
    }

    return { eventName, parsedData };
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");

    while (boundaryIndex !== -1) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (block) {
        const { eventName, parsedData } = parseEventBlock(block);

        if (eventName === "meta") {
          options.onMeta?.(parsedData as StreamMeta);
        } else if (eventName === "token") {
          options.onToken?.(String(parsedData?.token || ""));
        } else if (eventName === "done") {
          options.onDone?.(parsedData as StreamDonePayload);
        } else if (eventName === "error") {
          throw new Error(
            parsedData?.error || "Erro durante transmissão do chat."
          );
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  }
}