import { query } from "../config/db.js";

const DEFAULT_PRIORITY = 50;
const MIN_PRIORITY = 0;
const MAX_PRIORITY = 100;

const MEMORY_TTL_BY_TYPE = {
  profile: null,
  preference: 180,
  project: 120,
  goal: 120,
  routine: 60,
  location: 365,
  transit: 30,
  temporary: 7,
};

function safeRows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function clampPriority(value, fallback = DEFAULT_PRIORITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(numeric)));
}

function normalizeMemoryType(value = "profile") {
  const type = String(value || "profile").trim().toLowerCase();
  return type || "profile";
}

function normalizeMemoryKey(value = "") {
  return String(value || "").trim();
}

function normalizeMemoryValue(value = "") {
  return String(value || "").trim();
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveExpiresAt({ memoryType = "profile", ttlDays, expiresAt }) {
  if (expiresAt) {
    const explicitDate = new Date(expiresAt);
    if (!Number.isNaN(explicitDate.getTime())) {
      return explicitDate.toISOString();
    }
  }

  const parsedTtl = Number(ttlDays);
  if (Number.isFinite(parsedTtl) && parsedTtl > 0) {
    return addDays(new Date(), parsedTtl).toISOString();
  }

  const fallbackDays = MEMORY_TTL_BY_TYPE[normalizeMemoryType(memoryType)];
  if (fallbackDays === null || fallbackDays === undefined) {
    return null;
  }

  return addDays(new Date(), fallbackDays).toISOString();
}

function isExpired(memory) {
  if (!memory?.expires_at) return false;
  const expiresAt = new Date(memory.expires_at).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= Date.now();
}

function formatMemoryForClient(memory) {
  if (!memory) return null;

  return {
    ...memory,
    priority: Number(memory.priority ?? DEFAULT_PRIORITY),
    access_count: Number(memory.access_count ?? 0),
    is_expired: isExpired(memory),
    is_active: !isExpired(memory),
  };
}

function prioritizeMemories(memories = []) {
  return [...memories].sort((a, b) => {
    const priorityA = Number(a?.priority ?? DEFAULT_PRIORITY);
    const priorityB = Number(b?.priority ?? DEFAULT_PRIORITY);
    if (priorityA !== priorityB) return priorityB - priorityA;

    const updatedA = new Date(a?.updated_at || a?.created_at || 0).getTime();
    const updatedB = new Date(b?.updated_at || b?.created_at || 0).getTime();
    return updatedB - updatedA;
  });
}

function getMemoryTypeLabel(memoryType) {
  const map = {
    profile: "perfil",
    preference: "preferências",
    project: "projeto",
    goal: "objetivos",
    routine: "rotina",
    location: "locais",
    transit: "trânsito",
    temporary: "temporárias",
  };

  return map[normalizeMemoryType(memoryType)] || normalizeMemoryType(memoryType);
}

function buildProfileSummary(memories = []) {
  const active = prioritizeMemories(memories).filter((item) => !isExpired(item));

  const sections = [
    {
      label: "Perfil",
      types: ["profile"],
      max: 3,
    },
    {
      label: "Preferências",
      types: ["preference"],
      max: 3,
    },
    {
      label: "Projetos e objetivos",
      types: ["project", "goal"],
      max: 4,
    },
    {
      label: "Rotina e locais",
      types: ["routine", "location", "transit"],
      max: 4,
    },
  ];

  const lines = [];

  for (const section of sections) {
    const picked = active
      .filter((memory) => section.types.includes(normalizeMemoryType(memory.memory_type)))
      .slice(0, section.max)
      .map((memory) => `${memory.memory_key}: ${memory.memory_value}`);

    if (picked.length > 0) {
      lines.push(`${section.label}: ${picked.join(" | ")}`);
    }
  }

  if (lines.length === 0) {
    return "Ainda não há memórias relevantes salvas para este usuário.";
  }

  return lines.join(". ");
}

export function extractProjectMemory(memories = []) {
  const list = prioritizeMemories(Array.isArray(memories) ? memories : []).filter(
    (item) => !isExpired(item)
  );

  const findValue = (keys) => {
    const item = list.find((memory) =>
      keys.includes(String(memory?.memory_key || "").toLowerCase())
    );
    return item?.memory_value || null;
  };

  return {
    project: findValue(["project", "projeto", "current_project"]),
    category: findValue(["category", "categoria"]),
    status: findValue(["status"]),
    objective: findValue(["objective", "objetivo", "goal"]),
    problem: findValue(["problem", "problema"]),
    nextStep: findValue(["next_step", "proximo_passo", "proximo passo"]),
  };
}

export function summarizeMemoryStats(memories = []) {
  const total = memories.length;
  const expired = memories.filter((item) => item?.is_expired).length;
  const active = total - expired;

  return {
    total,
    active,
    expired,
    highPriority: memories.filter((item) => Number(item?.priority ?? 0) >= 80 && !item?.is_expired)
      .length,
  };
}

export async function getUserMemories(userId, options = {}) {
  if (!userId) {
    return {
      memories: [],
      activeMemories: [],
      projectMemory: extractProjectMemory([]),
      profileSummary: buildProfileSummary([]),
      stats: summarizeMemoryStats([]),
    };
  }

  const includeExpired = Boolean(options?.includeExpired);

  try {
    const result = await query(
      `
      SELECT
        id,
        user_id,
        memory_key,
        memory_value,
        memory_type,
        priority,
        source,
        expires_at,
        last_accessed_at,
        access_count,
        created_at,
        updated_at
      FROM user_memories
      WHERE user_id = $1
      ORDER BY priority DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      `,
      [userId]
    );

    const formatted = safeRows(result).map(formatMemoryForClient);
    const activeMemories = formatted.filter((item) => !item.is_expired);
    const selected = includeExpired ? formatted : activeMemories;

    return {
      memories: selected,
      activeMemories,
      projectMemory: extractProjectMemory(activeMemories),
      profileSummary: buildProfileSummary(activeMemories),
      stats: summarizeMemoryStats(formatted),
    };
  } catch (error) {
    console.error("Erro ao buscar memórias:", error.message);
    return {
      memories: [],
      activeMemories: [],
      projectMemory: extractProjectMemory([]),
      profileSummary: buildProfileSummary([]),
      stats: summarizeMemoryStats([]),
    };
  }
}

export async function getUserMemoryByKey(userId, memoryKey) {
  const normalizedKey = normalizeMemoryKey(memoryKey);
  if (!userId || !normalizedKey) return null;

  try {
    const result = await query(
      `
      SELECT
        id,
        user_id,
        memory_key,
        memory_value,
        memory_type,
        priority,
        source,
        expires_at,
        last_accessed_at,
        access_count,
        created_at,
        updated_at
      FROM user_memories
      WHERE user_id = $1
        AND memory_key = $2
      LIMIT 1
      `,
      [userId, normalizedKey]
    );

    return formatMemoryForClient(safeRows(result)[0] || null);
  } catch (error) {
    console.error("Erro ao buscar memória por chave:", error.message);
    return null;
  }
}

export async function markMemoryAccessed(userId, memoryKey) {
  const normalizedKey = normalizeMemoryKey(memoryKey);
  if (!userId || !normalizedKey) return null;

  try {
    const result = await query(
      `
      UPDATE user_memories
      SET
        last_accessed_at = NOW(),
        access_count = COALESCE(access_count, 0) + 1
      WHERE user_id = $1
        AND memory_key = $2
      RETURNING
        id,
        user_id,
        memory_key,
        memory_value,
        memory_type,
        priority,
        source,
        expires_at,
        last_accessed_at,
        access_count,
        created_at,
        updated_at
      `,
      [userId, normalizedKey]
    );

    return formatMemoryForClient(safeRows(result)[0] || null);
  } catch (error) {
    console.error("Erro ao marcar acesso da memória:", error.message);
    return null;
  }
}

export async function upsertUserMemory({
  userId,
  key,
  value,
  memoryType = "profile",
  priority = DEFAULT_PRIORITY,
  ttlDays,
  expiresAt,
  source = "manual",
}) {
  const normalizedKey = normalizeMemoryKey(key);
  const normalizedValue = normalizeMemoryValue(value);
  const normalizedType = normalizeMemoryType(memoryType);

  if (!userId || !normalizedKey || !normalizedValue) {
    return null;
  }

  const resolvedPriority = clampPriority(priority, DEFAULT_PRIORITY);
  const resolvedExpiresAt = resolveExpiresAt({
    memoryType: normalizedType,
    ttlDays,
    expiresAt,
  });

  try {
    const result = await query(
      `
      INSERT INTO user_memories (
        user_id,
        memory_key,
        memory_value,
        memory_type,
        priority,
        source,
        expires_at,
        last_accessed_at,
        access_count,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 1, NOW(), NOW())
      ON CONFLICT (user_id, memory_key)
      DO UPDATE SET
        memory_value = EXCLUDED.memory_value,
        memory_type = EXCLUDED.memory_type,
        priority = EXCLUDED.priority,
        source = EXCLUDED.source,
        expires_at = EXCLUDED.expires_at,
        last_accessed_at = NOW(),
        access_count = COALESCE(user_memories.access_count, 0) + 1,
        updated_at = NOW()
      RETURNING
        id,
        user_id,
        memory_key,
        memory_value,
        memory_type,
        priority,
        source,
        expires_at,
        last_accessed_at,
        access_count,
        created_at,
        updated_at
      `,
      [
        userId,
        normalizedKey,
        normalizedValue,
        normalizedType,
        resolvedPriority,
        normalizeOptionalText(source),
        resolvedExpiresAt,
      ]
    );

    return formatMemoryForClient(safeRows(result)[0] || null);
  } catch (error) {
    console.error("Erro ao salvar memória:", error.message);
    return null;
  }
}

export async function saveMemory({
  userId,
  key,
  value,
  type,
  memoryType,
  priority,
  ttlDays,
  expiresAt,
  source,
}) {
  return upsertUserMemory({
    userId,
    key,
    value,
    memoryType: memoryType || type || "profile",
    priority,
    ttlDays,
    expiresAt,
    source,
  });
}

export async function saveManyMemories(userId, memories = []) {
  if (!userId || !Array.isArray(memories) || memories.length === 0) {
    return [];
  }

  const saved = [];

  for (const memory of memories) {
    if (!memory?.key) continue;

    if (memory.action === "delete") {
      const removed = await deleteUserMemory(userId, memory.key);
      if (removed) {
        saved.push({
          memory_key: memory.key,
          memory_value: null,
          memory_type: memory.memoryType || "profile",
          priority: clampPriority(memory.priority, DEFAULT_PRIORITY),
          action: "delete",
        });
      }
      continue;
    }

    const result = await upsertUserMemory({
      userId,
      key: memory.key,
      value: memory.value,
      memoryType: memory.memoryType || "profile",
      priority: memory.priority,
      ttlDays: memory.ttlDays,
      expiresAt: memory.expiresAt,
      source: memory.source || "auto",
    });

    if (result) {
      saved.push(result);
    }
  }

  return saved;
}

export async function deleteUserMemory(userId, key) {
  const normalizedKey = normalizeMemoryKey(key);
  if (!userId || !normalizedKey) return false;

  try {
    await query(
      `
      DELETE FROM user_memories
      WHERE user_id = $1
        AND memory_key = $2
      `,
      [userId, normalizedKey]
    );

    return true;
  } catch (error) {
    console.error("Erro ao deletar memória:", error.message);
    return false;
  }
}

export const removeMemory = deleteUserMemory;
export { MEMORY_TTL_BY_TYPE, getMemoryTypeLabel, buildProfileSummary };
