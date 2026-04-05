import { generateAIResponse } from "../services/ai.service.js";

export async function chatController(req, res) {
  try {
    const { message } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    const reply = await generateAIResponse(String(message).trim());

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

export async function streamChatController(req, res) {
  try {
    const { message } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem obrigatória",
      });
    }

    const reply = await generateAIResponse(String(message).trim());

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const parts = String(reply).split(/(\s+)/).filter(Boolean);

    for (const token of parts) {
      res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
    }

    res.write(
      `event: done\ndata: ${JSON.stringify({
        ok: true,
        reply,
        message: { content: reply },
      })}\n\n`
    );

    res.end();
  } catch (error) {
    console.error("[STREAM CHAT ERROR]", error?.message || error);

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: "Erro no stream do chat",
      });
    }

    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: "Erro no stream do chat",
      })}\n\n`
    );
    res.end();
  }
}

export async function listSessionsController(_req, res) {
  return res.json({
    ok: true,
    sessions: [],
  });
}

export async function getSessionMessagesController(_req, res) {
  return res.json({
    ok: true,
    session: null,
    messages: [],
  });
}

export async function renameSessionController(_req, res) {
  return res.json({
    ok: true,
    session: null,
  });
}