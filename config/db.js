import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    if (!env.databaseUrl) {
      console.warn("[DB] DATABASE_URL não definida");
      return null;
    }

    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    pool.on("error", (err) => {
      console.error("[DB ERROR]", err.message);
    });

    console.log("[DB] Pool criado com sucesso");
  }

  return pool;
}

export async function testDbConnection() {
  try {
    const db = getPool();
    if (!db) return { ok: false };

    await db.query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/*
🔥 ESSA PARTE RESOLVE SEU ERRO
*/
export async function query(text, params = []) {
  const db = getPool();

  if (!db) {
    throw new Error("Banco não configurado");
  }

  return db.query(text, params);
}