import { testDatabase } from "../config/db.js";

export async function getSystemStatus(req, res) {
  try {
    const dbStatus = await testDatabase();

    return res.status(200).json({
      ok: true,
      app: "Megan OS Backend",
      status: "online",
      environment: process.env.NODE_ENV || "development",
      port: process.env.PORT || 10000,
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SYSTEM] Erro ao obter status do sistema:", error.message);

    return res.status(500).json({
      ok: false,
      message: "Erro ao obter status do sistema",
      error: error.message,
    });
  }
}

export async function healthCheck(req, res) {
  try {
    return res.status(200).json({
      ok: true,
      message: "Megan OS Backend online",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro no health check",
      error: error.message,
    });
  }
}