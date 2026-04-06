import { generateAIResponse } from "../services/ai.service.js";

function isNavigationRequest(message) {
  const text = String(message || "").toLowerCase();

  return [
    "navegar para",
    "ir para",
    "rota para",
    "me leve para",
    "abrir rota",
  ].some((pattern) => text.includes(pattern));
}

function extractDestination(message) {
  return message
    .toLowerCase()
    .replace("navegar para", "")
    .replace("ir para", "")
    .replace("rota para", "")
    .replace("me leve para", "")
    .trim();
}

export async function chatController(req, res) {
  try {
    const { message } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    const text = String(message).trim();

    // 🔥 DETECÇÃO DE NAVEGAÇÃO
    if (isNavigationRequest(text)) {
      const destinationName = extractDestination(text);

      return res.json({
        ok: true,
        reply: `🚗 Iniciando navegação para ${destinationName}`,
        meta: {
          navigation: {
            active: true,
            destination: {
              name: destinationName,
            },
          },
        },
      });
    }

    // 🤖 RESPOSTA NORMAL
    const reply = await generateAIResponse(text);

    return res.json({
      ok: true,
      reply,
    });

  } catch (error) {
    console.error("[CHAT ERROR]", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Erro no chat",
    });
  }
}