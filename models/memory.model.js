import { query } from "../config/db.js";

export async function upsertMemory({
  userId,
  key,
  value,
  type = "profile",
  priority = 50,
  expiresAt = null,
  source = "manual",
}) {
  const result = await query(
    `
    INSERT INTO user_memories (
      user_id,
      memory_key,
      memory_value,
      memory_type,
      priority,
      expires_at,
      source,
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
      expires_at = EXCLUDED.expires_at,
      source = EXCLUDED.source,
      last_accessed_at = NOW(),
      access_count = COALESCE(user_memories.access_count, 0) + 1,
      updated_at = NOW()
    RETURNING *
    `,
    [userId, key, value, type, priority, expiresAt, source]
  );

  return result.rows[0];
}

export async function listMemoriesByUser(userId) {
  const result = await query(
    `
    SELECT *
    FROM user_memories
    WHERE user_id = $1
    ORDER BY priority DESC, updated_at DESC
    `,
    [userId]
  );

  return result.rows;
}

export async function deleteMemory(userId, key) {
  const result = await query(
    `
    DELETE FROM user_memories
    WHERE user_id = $1 AND memory_key = $2
    RETURNING *
    `,
    [userId, key]
  );

  return result.rows[0] || null;
}
