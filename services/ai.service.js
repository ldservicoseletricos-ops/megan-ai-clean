import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function getGeminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
}

function getAiClient() {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    console.warn("[AI] GEMINI_API_KEY não configurada");
    return null;
  }

  try {
    return new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error("[AI] Falha ao iniciar GoogleGenAI:", error?.message || error);
    return null;
  }
}

export async function generateAIResponse(message) {
  try {
    const ai = getAiClient();

    if (!ai) {
      return "IA não configurada.";
    }

    const model = getGeminiModel();

    console.log("[AI] Gemini ativado");
    console.log("[AI] Modelo:", model);

    const result = await ai.models.generateContent({
      model,
      contents: String(message || "").trim(),
    });

    const text =
      result?.text ||
      result?.output_text ||
      result?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || "")
        .join("") ||
      "";

    return text || "A IA não retornou conteúdo.";
  } catch (error) {
    console.error("[AI ERROR]", error?.message || error);
    return "Erro ao gerar resposta da IA.";
  }
}