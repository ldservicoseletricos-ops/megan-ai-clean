export function validateUserMessage(message) {
  const text = String(message || "").trim();

  if (!text) {
    return {
      ok: false,
      reason: "A mensagem não pode estar vazia.",
    };
  }

  if (text.length > 12000) {
    return {
      ok: false,
      reason: "A mensagem está muito grande.",
    };
  }

  return {
    ok: true,
    reason: null,
  };
}

export function sanitizeAssistantOutput(text) {
  return String(text || "").replace(/\u0000/g, "").trim();
}