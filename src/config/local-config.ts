import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

/** Deployment settings belong to this machine, never the remote secret cache. */
export const LOCAL_SETTING_KEYS = new Set([
  "DB_DIALECT", "DATABASE_PATH", "BACKEND_PORT", "PORT", "FRONTEND_PORT", "FRONTEND_URL",
  "ACTIO_LOCAL_MODE", "ACTIO_CLOUDFLARE_ENABLED", "ACTIO_PUBLIC_URL", "CERNERE_URL",
  "PRAEFORMA_URL", "CONCORDIA_URL", "GOOGLE_REDIRECT_URI",
  "VITE_ALLOWED_HOSTS", "ACTIO_VITE_POLLING", "CORS_ORIGIN", "SECRETS_PROVIDER", "NODE_ENV",
]);
const allowed = new Set([...LOCAL_SETTING_KEYS, "DATABASE_URL", "REDIS_URL"]);
const settingsSchema = z.record(z.string(), z.string()).superRefine((settings, ctx) => {
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) ctx.addIssue({ code: "custom", message: `Unsupported local setting: ${key}` });
  }
});
const envelopeSchema = z.object({ version: z.literal(1), salt: z.string(), iv: z.string(), tag: z.string(), data: z.string() }).strict();

export function localConfigPath(): string {
  return process.env.ACTIO_CONFIG_PATH || join(process.env.LOCALAPPDATA || join(homedir(), ".config"), "Actio", "config.enc");
}

function masterKey(): string {
  const key = process.env.ACTIO_CONFIG_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw new Error("ACTIO_CONFIG_KEY must contain at least 32 bytes; inject it through Excubitor");
  return key;
}

/** AES-GCM authenticates the whole document; corrupt config must stop startup. */
export function readLocalConfig(): Record<string, string> {
  const path = localConfigPath();
  if (!existsSync(path)) {
    if (process.env.ACTIO_CONFIG_PATH) throw new Error("ACTIO_CONFIG_PATH does not exist");
    return {};
  }
  try {
    const blob = envelopeSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const salt = Buffer.from(blob.salt, "base64"), iv = Buffer.from(blob.iv, "base64"), tag = Buffer.from(blob.tag, "base64");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error("Invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(masterKey(), salt, 32), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]);
    return settingsSchema.parse(JSON.parse(plain.toString("utf8")));
  } catch {
    throw new Error("Cannot read Actio encrypted config; check its format and ACTIO_CONFIG_KEY");
  }
}

export function writeLocalConfig(input: unknown): void {
  const settings = settingsSchema.parse(input);
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(masterKey(), salt, 32), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(settings), "utf8"), cipher.final()]);
  const path = localConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, JSON.stringify({ version: 1, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }), { encoding: "utf8", mode: 0o600, flag: "wx" });
  try { renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

export function applyLocalConfig(): void {
  for (const [key, value] of Object.entries(readLocalConfig())) {
    // Explicit empty injection also overrides a stored value (e.g. disabling Redis).
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
