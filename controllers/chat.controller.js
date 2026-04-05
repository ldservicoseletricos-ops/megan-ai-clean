import path from "path";
import { query } from "../config/db.js";
import { env } from "../config/env.js";
import { logError, logWarn } from "../utils/logger.js";

let aiClientInstance = null;
let aiLoadAttempted = false;
let aiClientMode = null;

function normalizeText(value) {
  return String(value || "").trim();
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function inferMemoryType(key = "") {
  const normalized = String(key).toLowerCase().trim();

  if (["nome", "name", "perfil"].includes(normalized)) return "profile";
  if (["preferencia", "preferência", "gosto", "style", "estilo"].includes(normalized)) return "preference";
  if (["projeto", "project", "current_project"].includes(normalized)) return "project";
  if (["objetivo", "goal", "objective", "meta"].includes(normalized)) return "goal";
  if (["cidade", "local", "location"].includes(normalized)) return "location";

  return "profile";
}

function detectEmotion(text) {
  const t = normalizeText(text).toLowerCase();

  if (!t) return "neutral";
  if (/(triste|cansado|desanimado|exausto)/.test(t)) return "low";
  if (/(ansioso|preocupado|urgente|nervoso)/.test(t)) return "alert";
  if (/(feliz|animado|ótimo|otimo|empolgado)/.test(t)) return "high";

  return "neutral";
}

function extractMemories(message) {
  const original = normalizeText(message);
  const memories = [];

  const add = (key, value, memoryType = inferMemoryType(key), priority = 60) => {
    const finalKey = normalizeText(key).toLowerCase();
    const finalValue = normalizeText(value);

    if (!finalKey || !finalValue) return;

    memories.push({
      key: finalKey,
      value: finalValue,
      memoryType,
      priority,
      source: "chat",
    });
  };

  const nameMatch = original.match(/(?:meu nome é|me chamo|eu sou)\s+([^,.!\n]+)/i);
  if (nameMatch) add("nome", nameMatch[1], "profile", 95);

  const likesMatch = original.match(/(?:gosto de|prefiro)\s+([^.!\n]+)/i);
  if (likesMatch) add("preferencia", likesMatch[1], "preference", 75);

  const projectMatch = original.match(/(?:estou criando|estou fazendo|meu projeto é|projeto atual é)\s+([^.!\n]+)/i);
  if (projectMatch) add("projeto", projectMatch[1], "project", 90);

  const goalMatch = original.match(/(?:meu objetivo é|quero|preciso)\s+([^.!\n]+)/i);
  if (goalMatch) add("objetivo", goalMatch[1], "goal", 80);

  return memories;
}

function summarizeProfile(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return "Sem memórias relevantes ainda.";
  }

  return memories
    .slice(0, 8)
    .map((item) => `${item.memory_key}: ${item.memory_value}`)
    .join(" | ");
}

function summarizeHistory(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "Sem histórico recente.";
  }

  return messages
    .slice(-8)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");
}

function buildSystemPrompt({ profileSummary, historySummary, emotion, userName }) {
  return `Você é Megan OS, assistente operacional inteligente de Luiz Rosa.

ESTILO:
- direta
- estratégica
- prática
- organizada
- sem enrolação

REGRAS:
- responder em português do Brasil
- entregar solução aplicável
- quando útil, sugerir próximo passo claro
- manter respostas limpas e profissionais

CONTEXTO DO USUÁRIO:
Nome: ${userName || "Usuário"}
Emoção percebida: ${emotion}
Perfil: ${profileSummary}
Histórico recente:
${historySummary}`.trim();
}

function fileToClient(fileRow) {
  return {
    id: fileRow.id,
    name: fileRow.original_name,
    original_name: fileRow.original_name,
    mime_type: fileRow.mime_type,
    size_bytes: Number(fileRow.size_bytes || 0),
    url: fileRow.storage_path ? `/uploads/${path.basename(fileRow.storage_path)}` : null,
    created_at: fileRow.created_at,
  };
}

function buildFallbackReply({ message, userName }) {
  const name = normalizeText(userName) || "Luiz";

  return `Olá, ${name}. Recebi sua mensagem: "${message}". O chat está operacional, mas a integração com a IA ainda não respondeu. Próximo passo: verificar GEMINI_API_KEY e a dependência do Gemini no backend.`;
}

async function getAiClient() {
  if (aiClientInstance) {
    return { client: aiClientInstance, mode: aiClientMode };
  }

  if (aiLoadAttempted) {
    return { client: null, mode: null };
  }

  aiLoadAttempted = true;

  if (!env?.geminiApiKey) {
    logWarn("GEMINI_API_KEY não configurada");
    return { client: null, mode: null };
  }

  try {
    const mod = await import("@google/genai");
    if (mod?.GoogleGenAI) {
      aiClientInstance = new mod.GoogleGenAI({
        apiKey: env.geminiApiKey,
      });
      aiClientMode = "google-genai";
      return { client: aiClientInstance, mode: aiClientMode };
    }
  } catch (error) {
    logWarn("Pacote @google/genai não disponível", error?.message || error);
  }

  try {
    const mod = await import("@google/generative-ai");
    if (mod?.GoogleGenerativeAI) {
      aiClientInstance = new mod.GoogleGenerativeAI(env.geminiApiKey);
      aiClientMode = "google-generative-ai";
      return { client: aiClientInstance, mode: aiClientMode };
    }
  } catch (error) {
    logWarn("Pacote @google/generative-ai não disponível", error?.message || error);
  }

  return { client: null, mode: null };
}

async function ensureSession({ userId, sessionId, title }) {
  if (!userId) {
    throw new Error("Usuário não identificado");
  }

  if (sessionId) {
    const existing = await query(
      `
      SELECT id, user_id, title, created_at, updated_at
      FROM chat_sessions
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      `,
      [sessionId, userId]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }
  }

  const created = await query(
    `
    INSERT INTO chat_sessions (user_id, title)
    VALUES ($1, $2)
    RETURNING id, user_id, title, created_at, updated_at
    `,
    [userId, normalizeText(title) || "Nova conversa"]
  );

  return created.rows[0];
}

async function touchSession(sessionId) {
  if (!sessionId) return;

  await query(
    `
    UPDATE chat_sessions
    SET updated_at = NOW()
    WHERE id = $1
    `,
    [sessionId]
  );
}

async function getRecentMessages(sessionId) {
  if (!sessionId) return [];

  const result = await query(
    `
    SELECT id, role, content, metadata, created_at
    FROM chat_messages
    WHERE session_id = $1
    ORDER BY created_at ASC
    LIMIT 50
    `,
    [sessionId]
  );

  return result.rows.map((row) => ({
    ...row,
    metadata: row.metadata || {},
  }));
}

async function getTopMemories(userId) {
  if (!userId) return [];

  const result = await query(
    `
    SELECT memory_key, memory_value, memory_type, priority, updated_at, created_at
    FROM user_memories
    WHERE user_id = $1
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY priority DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 12
    `,
    [userId]
  );

  return result.rows;
}

async function saveExtractedMemories(userId, memories = []) {
  let updated = 0;

  for (const memory of memories) {
    try {
      await query(
        `
        INSERT INTO user_memories (
          user_id,
          memory_key,
          memory_value,
          memory_type,
          priority,
          source,
          last_accessed_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (user_id, memory_key)
        DO UPDATE SET
          memory_value = EXCLUDED.memory_value,
          memory_type = EXCLUDED.memory_type,
          priority = EXCLUDED.priority,
          source = EXCLUDED.source,
          last_accessed_at = NOW(),
          updated_at = NOW()
        `,
        [
          userId,
          memory.key,
          memory.value,
          memory.memoryType || inferMemoryType(memory.key),
          Number(memory.priority || 60),
          memory.source || "chat",
        ]
      );

      updated += 1;
    } catch (error) {
      logWarn("Falha ao salvar memória", error?.message || error);
    }
  }

  return updated;
}

async function saveMessage({ sessionId, userId, role, content, metadata = {} }) {
  const result = await query(
    `
    INSERT INTO chat_messages (session_id, user_id, role, content, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING id, role, content, metadata, created_at
    `,
    [sessionId, userId, role, content, JSON.stringify(metadata || {})]
  );

  return result.rows[0];
}

async function saveUploadedFiles({ userId, sessionId, files = [] }) {
  const saved = [];

  for (const file of files) {
    try {
      const inserted = await query(
        `
        INSERT INTO uploaded_files (
          user_id,
          session_id,
          original_name,
          mime_type,
          size_bytes,
          storage_path
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, original_name, mime_type, size_bytes, storage_path, created_at
        `,
        [
          userId,
          sessionId,
          file.originalname,
          file.mimetype || null,
          Number(file.size || 0),
          file.path || null,
        ]
      );

      saved.push(fileToClient(inserted.rows[0]));
    } catch (error) {
      logWarn("Falha ao registrar arquivo", error?.message || error);
    }
  }

  return saved;
}

async function generateReply({ message, systemPrompt, history = [], userName }) {
  const { client, mode } = await getAiClient();

  if (!client || !mode) {
    return {
      text: buildFallbackReply({ message, userName }),
      aiAvailable: false,
    };
  }

  const formattedHistory = history
    .slice(-10)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");

  const prompt = [
    systemPrompt,
    formattedHistory ? `\nCONVERSA:\n${formattedHistory}` : "",
    `\nUSUÁRIO: ${message}`,
    "\nASSISTENTE:",
  ]
    .filter(Boolean)
    .join("\n");

  const modelName = env?.geminiModel || "gemini-2.5-flash";

  try {
    if (mode === "google-genai") {
      const result = await client.models.generateContent({
        model: modelName,
        contents: prompt,
      });

      const text = normalizeText(
        result?.text ||
        result?.output_text ||
        result?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
        ""
      );

      return {
        text: text || buildFallbackReply({ message, userName }),
        aiAvailable: true,
      };
    }

    if (mode === "google-generative-ai") {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = normalizeText(result?.response?.text?.() || "");

      return {
        text: text || buildFallbackReply({ message, userName }),
        aiAvailable: true,
      };
    }

    return {
      text: buildFallbackReply({ message, userName }),
      aiAvailable: false,
    };
  } catch (error) {
    logError("Falha ao gerar resposta da IA", error?.message || error);

    return {
      text: buildFallbackReply({ message, userName }),
      aiAvailable: false,
    };
  }
}

function extractUserFromRequest(req) {
  return {
    id: req.user?.id || null,
    name: req.user?.name || req.headers["x-user-name"] || "Luiz",
    email: req.user?.email || null,
    externalId: req.user?.externalId || req.headers["x-user-id"] || null,
  };
}

function getRequestMessage(req) {
  return normalizeText(req.body?.message);
}

function getRequestSessionId(req) {
  return normalizeText(req.body?.sessionId || req.params?.sessionId);
}

function getRequestDeviceLocation(req) {
  return safeJsonParse(req.body?.deviceLocation, null);
}

function buildProjectMemory(topMemories = []) {
  const findMemory = (keys = []) =>
    topMemories.find((item) =>
      keys.includes(String(item.memory_key || "").toLowerCase())
    )?.memory_value || null;

  return {
    project: findMemory(["project", "projeto", "current_project"]),
    category: findMemory(["category", "categoria"]),
    status: findMemory(["status"]),
    objective: findMemory(["goal", "objective", "objetivo"]),
    problem: findMemory(["problem", "problema"]),
    nextStep: findMemory(["next_step", "proximo_passo", "proximo passo"]),
  };
}

async function buildChatResponse({ req, saveAssistant = true }) {
  const message = getRequestMessage(req);
  const currentUser = extractUserFromRequest(req);

  if (!message) {
    const error = new Error("Mensagem obrigatória");
    error.statusCode = 400;
    throw error;
  }

  if (!currentUser.id) {
    const error = new Error("Usuário não autenticado");
    error.statusCode = 401;
    throw error;
  }

  const session = await ensureSession({
    userId: currentUser.id,
    sessionId: getRequestSessionId(req),
    title: message.slice(0, 60),
  });

  const recentMessages = await getRecentMessages(session.id);
  const topMemories = await getTopMemories(currentUser.id);
  const emotion = detectEmotion(message);

  const systemPrompt = buildSystemPrompt({
    profileSummary: summarizeProfile(topMemories),
    historySummary: summarizeHistory(recentMessages),
    emotion,
    userName: currentUser.name,
  });

  const userMetadata = {
    source: "chat",
    deviceLocation: getRequestDeviceLocation(req),
    fileCount: Array.isArray(req.files) ? req.files.length : 0,
  };

  const userMessageRow = await saveMessage({
    sessionId: session.id,
    userId: currentUser.id,
    role: "user",
    content: message,
    metadata: userMetadata,
  });

  const files = await saveUploadedFiles({
    userId: currentUser.id,
    sessionId: session.id,
    files: Array.isArray(req.files) ? req.files : [],
  });

  const generation = await generateReply({
    message,
    systemPrompt,
    history: recentMessages,
    userName: currentUser.name,
  });

  let assistantMessageRow = {
    id: null,
    role: "assistant",
    content: generation.text,
    metadata: {
      emotion,
      aiAvailable: generation.aiAvailable,
      files,
    },
    created_at: new Date().toISOString(),
  };

  if (saveAssistant) {
    assistantMessageRow = await saveMessage({
      sessionId: session.id,
      userId: currentUser.id,
      role: "assistant",
      content: generation.text,
      metadata: {
        emotion,
        aiAvailable: generation.aiAvailable,
        files,
      },
    });
  }

  const extractedMemories = extractMemories(message);
  const memoryUpdated = await saveExtractedMemories(currentUser.id, extractedMemories);

  await touchSession(session.id);

  return {
    ok: true,
    sessionId: session.id,
    message: {
      ...assistantMessageRow,
      metadata: assistantMessageRow.metadata || {},
    },
    intent: "chat",
    emotion,
    files,
    weather: null,
    transit: null,
    imageForVision: null,
    fileMode: files.length > 0 ? "files" : null,
    memory: {
      used: topMemories.length,
      updated: memoryUpdated,
    },
    projectMemory: buildProjectMemory(topMemories),
    aiAvailable: generation.aiAvailable,
    savedUserMessage: userMessageRow,
  };
}

export async function chatController(req, res) {
  try {
    const payload = await buildChatResponse({ req, saveAssistant: true });
    return res.json(payload);
  } catch (error) {
    logError("Erro no chat", error?.message || error);

    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error?.message || "Erro interno no chat",
    });
  }
}

export async function streamChatController(req, res) {
  try {
    const payload = await buildChatResponse({ req, saveAssistant: true });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const meta = {
      sessionId: payload.sessionId,
      intent: payload.intent,
      fileMode: payload.fileMode,
      files: payload.files,
      weather: payload.weather,
      transit: payload.transit,
      imageForVision: payload.imageForVision,
      aiAvailable: payload.aiAvailable,
    };

    res.write(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`);

    for (const piece of String(payload.message.content || "").split(/(\s+)/).filter(Boolean)) {
      res.write(`event: token\ndata: ${JSON.stringify({ token: piece })}\n\n`);
    }

    res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
    res.end();
  } catch (error) {
    logError("Erro no chat stream", error?.message || error);

    if (!res.headersSent) {
      return res.status(error.statusCode || 500).json({
        ok: false,
        error: error?.message || "Erro interno no stream",
      });
    }

    res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || "Erro interno no stream" })}\n\n`);
    res.end();
  }
}

export async function listSessionsController(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "Usuário não autenticado",
      });
    }

    const result = await query(
      `
      SELECT id, title, created_at, updated_at
      FROM chat_sessions
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      `,
      [userId]
    );

    return res.json({
      ok: true,
      sessions: result.rows,
    });
  } catch (error) {
    logError("Erro ao listar sessões", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Falha ao listar sessões",
    });
  }
}

export async function getSessionMessagesController(req, res) {
  try {
    const userId = req.user?.id;
    const sessionId = getRequestSessionId(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "Usuário não autenticado",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: "sessionId obrigatório",
      });
    }

    const sessionResult = await query(
      `
      SELECT id, title, created_at, updated_at
      FROM chat_sessions
      WHERE id = $1 AND user_id = $2
      LIMIT 1
      `,
      [sessionId, userId]
    );

    const session = sessionResult.rows[0];

    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "Sessão não encontrada",
      });
    }

    const messages = await getRecentMessages(sessionId);

    return res.json({
      ok: true,
      session,
      messages,
    });
  } catch (error) {
    logError("Erro ao buscar mensagens", error?.message || error);

    return res.status(500).json({
      ok: false,
      error: "Falha ao buscar mensagens",
    });
  }
}