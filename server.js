import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/* =========================
   CHAT COM IA REAL
========================= */
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "Mensagem é obrigatória",
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
    });

    const reply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sem resposta da IA";

    return res.json({
      ok: true,
      reply,
    });
  } catch (error) {
    console.error("Erro no Gemini:", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao gerar resposta da IA",
    });
  }
});