const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:10000";

export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) {
    throw new Error("Falha ao verificar backend");
  }
  return res.json();
}

export async function sendChatMessage(message: string, deviceLocation?: any) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      deviceLocation: deviceLocation || null,
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
  deviceLocation?: any,
  sessionToken?: string
) {
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
    throw new Error(data?.error || "Erro ao buscar sugestões");
  }

  return data;
}

export async function getNavigationQuickAccess() {
  const res = await fetch(`${API_URL}/api/navigation/quick-access`);

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Erro ao buscar atalhos");
  }

  return data;
}