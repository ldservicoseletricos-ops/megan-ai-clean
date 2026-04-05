import jwt from "jsonwebtoken";
import { getPool } from "../config/db.js";

const db = getPool();

async function query(text, params = []) {
  if (!db) throw new Error("Banco não configurado");
  return db.query(text, params);
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "Token ausente",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await query(
      `
      SELECT id, name, email, provider, email_verified, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [decoded.sub]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Usuário não encontrado",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "Sessão inválida",
    });
  }
}