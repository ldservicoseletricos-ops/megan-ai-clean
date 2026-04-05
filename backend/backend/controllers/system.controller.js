import { testDatabase } from "../config/db.js";
import { env } from "../config/env.js";

export async function healthCheck(_req, res) {
  const db = await testDatabase();

  res.json({
    ok: true,
    app: "Megan OS Backend",
    env: env.nodeEnv,
    port: env.port,
    database: db.ok,
    databaseInfo: db,
    ai: {
      openai: Boolean(env.openAiApiKey),
      gemini: Boolean(env.geminiApiKey),
      mock: env.allowMockAi,
    },
    time: new Date().toISOString(),
  });
}