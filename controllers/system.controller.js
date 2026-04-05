import { testDbConnection } from "../config/db.js";

export async function systemStatusController(req, res) {
  try {
    const db = await testDbConnection();

    return res.status(200).json({
      ok: true,
      system: "Megan OS",
      database: db,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}