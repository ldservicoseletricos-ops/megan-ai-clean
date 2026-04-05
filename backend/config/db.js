import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.warn("[DB] DATABASE_URL não definida");
    return null;
  }

  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    console.log("[DB] Conectado com sucesso");

    return pool;
  } catch (err) {
    console.error("[DB ERROR]", err.message);
    return null;
  }
}