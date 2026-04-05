import { testDatabase } from "../config/db.js";

export async function healthCheck(_req, res) {
  try {
    const database = await testDatabase();

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
      app: "Megan OS Backend",
      status: "error",
      error: error.message || "Erro no health check",
      time: new Date().toISOString(),
    });
  }
}

export async function systemStatusController(req, res) {
  try {
    return res.status(200).json({
      ok: true,
      app: "Megan OS Backend",
      status: "online",
      user: req.user || null,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      app: "Megan OS Backend",
      status: "error",
      error: error.message || "Erro ao obter status do sistema",
      time: new Date().toISOString(),
    });
  }
}