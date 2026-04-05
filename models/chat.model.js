import { query } from "../config/db.js";

export async function createChatSession(userId, title = "Nova conversa") {
  const result = await query(
    `
    INSERT INTO chat_sessions (user_id, title)
    VALUES ($1, $2)
    RETURNING *
    `,
    [userId, title]
  );

  return result.rows[0];
}

export async function getChatSessionById(sessionId, userId) {
  const result = await query(
    `
    SELECT *
    FROM chat_sessions
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [sessionId, userId]
  );

  return result.rows[0] || null;
}

export async function touchChatSession(sessionId) {
  await query(
    `
    UPDATE chat_sessions
    SET updated_at = NOW()
    WHERE id = $1
    `,
    [sessionId]
  );
}

export async function createMessage({ sessionId, userId, role, content, metadata = {} }) {
  const result = await query(
    `
    INSERT INTO chat_messages (session_id, user_id, role, content, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING *
    `,
    [sessionId, userId, role, content, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

export async function listMessagesBySession(sessionId, userId, limit = 30) {
  const result = await query(
    `
    SELECT *
    FROM chat_messages
    WHERE session_id = $1 AND user_id = $2
    ORDER BY created_at ASC
    LIMIT $3
    `,
    [sessionId, userId, limit]
  );

  return result.rows;
}

export async function listSessionsByUser(userId, limit = 20) {
  const result = await query(
    `
    SELECT *
    FROM chat_sessions
    WHERE user_id = $1
    ORDER BY updated_at DESC
    LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}