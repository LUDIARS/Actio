/** Use the selected database; never silently create an unrelated SQLite file. */
import { initSecrets, secretManager } from "../config/secrets.js";
await initSecrets();
try {
  const dialect = secretManager.get("DB_DIALECT") || "postgres";
  if (dialect === "sqlite") await import("./migrate-sqlite.js");
  else if (dialect === "postgres") {
    const { createConnectionWithRetry } = await import("./dialects/postgres.js");
    const db = await createConnectionWithRetry();
    await db.$client.end();
  } else throw new Error("db:init supports postgres or sqlite; use the configured MySQL migration tool explicitly");
} finally { secretManager.destroy(); }
