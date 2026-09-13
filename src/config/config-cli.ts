import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { LOCAL_SETTING_KEYS, writeLocalConfig } from "./local-config.js";

// Read values through stdin, never command arguments or output. No remote writes.
try {
  const command = process.argv[2];
  const input = readFileSync(0, "utf8").replace(/^\uFEFF/, "");
  if (command === "seal") writeLocalConfig(JSON.parse(input));
  else if (command === "import-env") {
    const accepted = new Set([...LOCAL_SETTING_KEYS, "DATABASE_URL", "REDIS_URL"]);
    writeLocalConfig(Object.fromEntries(Object.entries(parseEnv(input)).filter(([key]) => accepted.has(key))));
  } else throw new Error("Use config:seal or config:import-env with input on stdin");
  console.log("Encrypted local config saved; restart through Excubitor when authorized.");
} catch {
  console.error("Config save failed. Check command, allowed settings, destination and ACTIO_CONFIG_KEY.");
  process.exitCode = 1;
}
