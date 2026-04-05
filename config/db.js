import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

let pool = null;

function maskDatabaseUrl(url) {
  if (!url) return "undefined";
  return url.replace(/:(.*?)@/, ":****@");
}

function isInvalidDatabaseUrl(url) {
  if (!url) return true;

  const normalized = String(url).trim();

  return (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "base" ||
    normalized.includes("[YOUR-PASSWORD]") ||
    (!normalized.startsWith("postgresql://") &&
      !normalized.startsWith("postgres://"))
  );
}

function createPool() {
  const databaseUrl = env.databaseUrl;

  if (isInvalidDatabaseUrl(databaseUrl)) {
    console.warn("[WARN] DATABASE_URL inválida", maskDatabaseUrl(databaseUrl));
    return null;
  }

  try {
    console.log(
      "[INFO] Inicializando banco",
      maskDatabaseUrl(databaseUrl)
    );

    const createdPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });

    createdPool.on("error", (error) => {
      console.error("[WARN] Erro no banco", error.message);
    });

    return createdPool;
  } catch (error) {
    console.error("[ERROR] Falha ao criar pool do banco:", error.message);
    return null;
  }
}

export function getPool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function query(text, params = []) {
  const db = getPool();

  if (!db) {
    throw new Error("Banco não configurado");
  }

  return db.query(text, params);
}

export async function testDatabase() {
  try {
    const result = await query("select now() as now");
    return {
      ok: true,
      now: result.rows?.[0]?.now ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}