const API_URL =
  (import.meta as any).env?.VITE_API_URL?.trim() ||
  "https://megan-ai.onrender.com";

function normalizeApiUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "");
}

const BASE_URL = normalizeApiUrl(API_URL);

export type ChatSession = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, any>;
  created_at?: string;
};

async function safeJson(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function sendMessage(
  message: string,
  token?: string,
  sessionId?: string,
  files?: File[]
) {
  const hasFiles = Array.isArray(files) && files.length > 0;

  if (hasFiles) {
    const formData = new FormData();
    formData.append("message", message);

    if (sessionId) {
      formData.append("sessionId", sessionId);
    }

    for (const file of files || []) {
      formData.append("files", file);
    }

    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const data = await safeJson(response);

    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || "Erro ao enviar mensagem"
      );
    }

    return data;
  }

  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      sessionId,
    }),
  });

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Erro ao enviar mensagem");
  }

  return data;
}

type StreamHandlers = {
  onToken?: (token: string) => void;
  onDone?: (payload: any) => void;
  onError?: (message: string) => void;
};

export async function streamMessage(
  message: string,
  token?: string,
  handlers?: StreamHandlers,
  sessionId?: string,
  files?: File[]
) {
  const hasFiles = Array.isArray(files) && files.length > 0;

  let response: Response;

  if (hasFiles) {
    const formData = new FormData();
    formData.append("message", message);

    if (sessionId) {
      formData.append("sessionId", sessionId);
    }

    for (const file of files || []) {
      formData.append("files", file);
    }

    response = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
  } else {
    response = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        sessionId,
      }),
    });
  }

  if (!response.ok || !response.body) {
    const data = await safeJson(response);
    throw new Error(
      data?.error || data?.message || "Erro ao iniciar stream"
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  function processBlock(block: string) {
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

    const raw = dataLines.join("\n");
    let parsed: any = raw;

    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = raw;
    }

    if (eventName === "token") {
      handlers?.onToken?.(String(parsed?.token || ""));
    } else if (eventName === "done") {
      handlers?.onDone?.(parsed);
    } else if (eventName === "error") {
      handlers?.onError?.(parsed?.error || "Erro no stream");
    }
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
        processBlock(block);
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  }
}

export async function getSessions(token?: string): Promise<ChatSession[]> {
  const response = await fetch(`${BASE_URL}/api/chat/sessions`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || "Erro ao carregar conversas"
    );
  }

  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function getSessionMessages(
  sessionId: string,
  token?: string
): Promise<ChatMessage[]> {
  const response = await fetch(
    `${BASE_URL}/api/chat/sessions/${sessionId}/messages`,
    {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || "Erro ao carregar mensagens"
    );
  }

  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function renameSession(
  sessionId: string,
  title: string,
  token?: string
) {
  const response = await fetch(`${BASE_URL}/api/chat/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title }),
  });

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || "Erro ao renomear conversa"
    );
  }

  return data?.session;
}