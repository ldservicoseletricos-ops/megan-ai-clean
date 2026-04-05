import fs from "fs";
import path from "path";
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pkg;

function isRemoteDatabase(databaseUrl) {
  if (!databaseUrl) return false;

  return (
    !databaseUrl.includes("@localhost:") &&
    !databaseUrl.includes("@127.0.0.1:")
  );
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL não definida no .env");
    process.exit(1);
  }

  const schemaPath = path.resolve("database", "schema.sql");

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Arquivo não encontrado: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, "utf-8");

  const clientConfig = {
    connectionString: databaseUrl,
  };

  if (isRemoteDatabase(databaseUrl)) {
    clientConfig.ssl = {
      rejectUnauthorized: false,
    };
  }

  const client = new Client(clientConfig);

  try {
    await client.connect();
    await client.query(sql);
    console.log("✅ Schema aplicado com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao aplicar schema:");
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();