import pkg from "pg";
import { env } from "./env.js";

const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    pool.on("error", (err) => {
      console.error("[DB ERROR]", err.message);
    });
  }

  return pool;
}

// 🔥 QUERY PADRÃO
export async function query(text, params = []) {
  const db = getPool();
  return db.query(text, params);
}

// 🔥 TESTE DE BANCO (PADRÃO GLOBAL)
export async function testDatabase() {
  try {
    const db = getPool();
    await db.query("SELECT 1");

    return {
      ok: true,
      message: "Banco conectado",
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}