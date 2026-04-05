import { query } from "../config/db.js";

/**
 * Salvar memória (create ou update)
 */
export async function saveMemory({
  userId,
  key,
  value,
  type = "profile",
  priority = 1,
  ttlDays,
  expiresAt,
  source = "manual",
}) {
  const finalExpiresAt =
    expiresAt ||
    (ttlDays
      ? new Date(Date.now() + ttlDays * 86400000).toISOString()
      : null);

  const result = await query(
    `
    INSERT INTO user_memories (user_id, key, value, memory_type, priority, expires_at, source)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id, key)
    DO UPDATE SET
      value = EXCLUDED.value,
      memory_type = EXCLUDED.memory_type,
      priority = EXCLUDED.priority,
      expires_at = EXCLUDED.expires_at,
      source = EXCLUDED.source,
      updated_at = NOW()
    RETURNING *;
    `,
    [userId, key, value, type, priority, finalExpiresAt, source]
  );

  return result.rows[0];
}

/**
 * Buscar memórias do usuário
 */
export async function getUserMemories(userId) {
  const result = await query(
    `SELECT * FROM user_memories WHERE user_id = $1 ORDER BY priority DESC`,
    [userId]
  );

  return {
    memories: result.rows,
    activeMemories: result.rows,
    projectMemory: null,
    profileSummary: null,
    stats: {
      total: result.rows.length,
    },
  };
}

/**
 * Remover memória
 */
export async function removeMemory(userId, key) {
  const result = await query(
    `DELETE FROM user_memories WHERE user_id = $1 AND key = $2 RETURNING *`,
    [userId, key]
  );

  return result.rowCount > 0;
}

/**
 * Label do tipo de memória
 */
export function getMemoryTypeLabel(type) {
  const map = {
    profile: "Perfil",
    project: "Projeto",
    preference: "Preferência",
    context: "Contexto",
  };

  return map[type] || "Geral";
}