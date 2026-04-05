import { testDbConnection } from "../config/db.js";

export async function healthCheck(_req, res) {
  try {
    const database = await testDbConnection();

    return res.status(database.ok ? 200 : 500).json({
      ok: database.ok,
      app: "Megan OS Backend",
      status: database.ok ? "online" : "db_error",
      database,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Erro no health check",
    });
  }
}

export async function systemStatusController(req, res) {
  return healthCheck(req, res);
}