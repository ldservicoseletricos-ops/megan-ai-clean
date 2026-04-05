import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

let pool = null;

function maskDatabaseUrl(url) {
  const raw = String(url || "").trim();

  if (!raw) return "MISSING";

  return raw.replace(/:(.*?)@/, ":****@");
}

function isInvalidDatabaseUrl(url) {
  const raw = String(url || "").trim();

  if (!raw) return true;
  if (raw === "base") return true;
  if (raw.includes("[YOUR-PASSWORD]")) return true;
  if (raw.includes("SUA_SENHA")) return true;
  if (raw.includes("undefined")) return true;

  return !raw.startsWith("postgresql://") && !raw.startsWith("postgres://");
}

function buildPoolConfig(databaseUrl) {
  return {
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };
}

export function createPool() {
  const databaseUrl = env.databaseUrl;

  if (isInvalidDatabaseUrl(databaseUrl)) {
    console.warn("[DB] DATABASE_URL inválida:", maskDatabaseUrl(databaseUrl));
    return null;
  }

  try {
    const createdPool = new Pool(buildPoolConfig(databaseUrl));

    createdPool.on("error", (error) => {
      console.error("[DB] Erro no pool:", error.message);
    });

    console.log("[DB] Pool PostgreSQL inicializado:", maskDatabaseUrl(databaseUrl));

    return createdPool;
  } catch (error) {
    console.error("[DB] Falha ao criar pool:", error.message);
    return null;
  }
}

export function getPool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

export async function testDbConnection() {
  const db = getPool();

  if (!db) {
    return {
      ok: false,
      error: "Banco não configurado",
    };
  }

  try {
    const result = await db.query("SELECT NOW() AS now");

    return {
      ok: true,
      time: result.rows?.[0]?.now || null,
    };
  } catch (error) {
    console.error("[DB] Erro ao testar conexão:", error.message);

    return {
      ok: false,
      error: error.message,
    };
  }
}

export async function closePool() {
  if (!pool) return;

  try {
    await pool.end();
    console.log("[DB] Pool encerrado com sucesso");
  } catch (error) {
    console.error("[DB] Erro ao encerrar pool:", error.message);
  } finally {
    pool = null;
  }
}

export default {
  createPool,
  getPool,
  testDbConnection,
  closePool,
};