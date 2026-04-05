import { query } from "../config/db.js";

export async function ensureUserByExternalId({ externalId, name, email }) {
  const existing = await query(
    `
    SELECT *
    FROM app_users
    WHERE external_id = $1
    LIMIT 1
    `,
    [externalId]
  );

  if (existing.rows[0]) {
    const updated = await query(
      `
      UPDATE app_users
      SET name = COALESCE($2, name),
          email = COALESCE($3, email)
      WHERE external_id = $1
      RETURNING *
      `,
      [externalId, name || null, email || null]
    );

    return updated.rows[0];
  }

  const created = await query(
    `
    INSERT INTO app_users (external_id, name, email)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [externalId, name || null, email || null]
  );

  return created.rows[0];
}