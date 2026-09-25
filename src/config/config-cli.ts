import { readFileSync } from "node:fs";
import { writeLocalConfig } from "./local-config.js";

// Read values through stdin, never command arguments or output. No remote writes.
try {
  const command = process.argv[2];
  const input = readFileSync(0, "utf8").replace(/^﻿/, "");
  if (command === "seal") writeLocalConfig(JSON.parse(input));
  else throw new Error("Use config:seal with JSON on stdin");
  console.log("Encrypted local config saved; restart through Excubitor when authorized.");
} catch {
  console.error("Config save failed. Check command, allowed settings, destination and ACTIO_CONFIG_KEY.");
  process.exitCode = 1;
}
