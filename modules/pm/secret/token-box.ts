/**
 * PM の接続トークン (GitHub PAT / Notion Integration Token) の暗号化 (completion.md AT-PM-SECRET)
 *
 * 鍵は暗号化ローカル config と同じ ACTIO_CONFIG_KEY (Excubitor が注入)。値ごとに salt と IV を変える。
 * 形式: enc:v1:<salt b64>:<iv b64>:<tag b64>:<ciphertext b64>
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const PREFIX = "enc:v1:";
const MIN_KEY_BYTES = 32;

export class PmSecretKeyMissingError extends Error {
  constructor() {
    super("ACTIO_CONFIG_KEY が未設定のため、接続トークンを保存できません (Excubitor から注入してください)");
  }
}

export type KeySource = () => string | undefined;

const defaultKeySource: KeySource = () => process.env.ACTIO_CONFIG_KEY;

function requireKey(keySource: KeySource): string {
  const key = keySource();
  if (!key || Buffer.byteLength(key) < MIN_KEY_BYTES) throw new PmSecretKeyMissingError();
  return key;
}

export function isSealedToken(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function sealToken(plain: string, keySource: KeySource = defaultKeySource): string {
  const key = requireKey(keySource);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(key, salt, 32), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [salt, iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(":");
}

/** 暗号文なら復号する。旧データの平文はそのまま返す (次の更新で暗号化される)。 */
export function openToken(stored: string, keySource: KeySource = defaultKeySource): string {
  if (!isSealedToken(stored)) return stored;
  const key = requireKey(keySource);
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 4) throw new Error("接続トークンの暗号文の形式が不正です");
  const [salt, iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(key, salt, 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
