import { env } from "../config/env.js";

function buildMockResponse(messages) {
  const lastUserMessage = [...messages].reverse().find((item) => item.role === "user");
  const content = lastUserMessage?.content || "";

  return `Modo local da Megan ativo.\n\nRecebi sua mensagem:\n"${content}"\n\nPara visão real de imagem e streaming completo com IA externa, configure OPENAI_API_KEY ou GEMINI_API_KEY no .env.`;
}

function normalizeOpenAiMessages(messages = []) {
  return messages.map((message) => {
    if (Array.isArray(message.content)) {
      return {
        role: message.role,
        content: message.content,
      };
    }

    return {
      role: message.role,
      content: String(message.content || ""),
    };
  });
}

async function callOpenAI(messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: env.openAiModel,
      messages: normalizeOpenAiMessages(messages),
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha OpenAI: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

function convertMessagesToGeminiPrompt(messages = []) {
  return messages
    .map((item) => {
      if (Array.isArray(item.content)) {
        const text = item.content
          .map((part) => {
            if (part.type === "text") return part.text || "";
            if (part.type === "image_url") return "[imagem enviada]";
            return "";
          })
          .join("\n");
        return `${item.role.toUpperCase()}: ${text}`;
      }

      return `${item.role.toUpperCase()}: ${item.content}`;
    })
    .join("\n\n");
}

async function callGemini(messages) {
  const prompt = convertMessagesToGeminiPrompt(messages);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha Gemini: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text = "") {
  return String(text).match(/(\S+\s*|\n)/g) || [];
}

async function streamSimulatedText(text, onToken) {
  const chunks = chunkText(text);

  for (const chunk of chunks) {
    onToken(chunk);
    await sleep(12);
  }
}

async function streamOpenAI(messages, onToken) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: env.openAiModel,
      messages: normalizeOpenAiMessages(messages),
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`Falha OpenAI stream: ${response.status} - ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.replace(/^data:\s*/, "");
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const token = json?.choices?.[0]?.delta?.content || "";
        if (token) {
          onToken(token);
        }
      } catch {
        // ignora linhas inválidas
      }
    }
  }
}

async function streamGemini(messages, onToken) {
  const prompt = convertMessagesToGeminiPrompt(messages);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:streamGenerateContent?alt=sse&key=${env.geminiApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`Falha Gemini stream: ${response.status} - ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      const data = dataLine.replace(/^data:\s*/, "").trim();
      if (!data) continue;

      try {
        const json = JSON.parse(data);
        const token =
          json?.candidates?.[0]?.content?.parts
            ?.map((p) => p?.text || "")
            .join("") || "";

        if (token) {
          onToken(token);
        }
      } catch {
        // ignora linhas inválidas
      }
    }
  }
}

export async function generateAiResponse(messages) {
  if (env.openAiApiKey) {
    return callOpenAI(messages);
  }

  if (env.geminiApiKey) {
    return callGemini(messages);
  }

  if (env.allowMockAi) {
    return buildMockResponse(messages);
  }

  throw new Error("Nenhum provedor de IA configurado.");
}

export async function streamAiResponse(messages, handlers = {}) {
  const { onToken = () => {}, onDone = () => {}, onError = () => {} } = handlers;

  try {
    if (env.openAiApiKey) {
      await streamOpenAI(messages, onToken);
      onDone();
      return;
    }

    if (env.geminiApiKey) {
      await streamGemini(messages, onToken);
      onDone();
      return;
    }

    if (env.allowMockAi) {
      const text = buildMockResponse(messages);
      await streamSimulatedText(text, onToken);
      onDone();
      return;
    }

    throw new Error("Nenhum provedor de IA configurado.");
  } catch (error) {
    onError(error);
    throw error;
  }
}