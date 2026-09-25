/**
 * 「secret をどの Infisical project から受け取るか」の設定 (暗号化ローカル config に保存)。
 *
 * Actio が持つのは取得元の指定だけで、Infisical の接続先や認証情報は持たない。
 * 値は Excubitor の secret-agent が Excubitor 自身の machine identity で引いて返す。
 */
import { LOCAL_SETTING_KEYS } from "./local-config.js";

type Env = Record<string, string | undefined>;

export const SECRET_SOURCE_KEYS = ["ACTIO_SECRET_PROJECT_ID", "ACTIO_SECRET_ENVIRONMENT", "ACTIO_SECRET_KEYS"] as const;

export interface SecretSource {
  projectId: string;
  environment: string;
  /** Excubitor に取得を許すキー。全量取得はしない (ローカルモードの URL 等と衝突するため)。 */
  keys: string[];
}

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_SECRET_KEYS = 64;

export type SecretSourceResult = { ok: true; source: SecretSource } | { ok: false; error: string };

/** 入力や保存値を検証して取得元にする。エラー文に値は含めない。 */
export function parseSecretSource(projectId: string, environment: string, keys: string): SecretSourceResult {
  if (!PROJECT_ID_PATTERN.test(projectId)) return { ok: false, error: "project id is not a valid Infisical project id" };
  if (!ENVIRONMENT_PATTERN.test(environment)) return { ok: false, error: "environment must be an Infisical environment slug" };
  const list = [...new Set(keys.split(/[\s,]+/).filter((key) => key.length > 0))];
  if (list.length === 0) return { ok: false, error: "at least one secret key is required" };
  if (list.length > MAX_SECRET_KEYS) return { ok: false, error: "too many secret keys" };
  for (const key of list) {
    if (!SECRET_KEY_PATTERN.test(key)) return { ok: false, error: "secret keys must be UPPER_SNAKE_CASE names" };
    // Deployment settings stay local; a remote value once broke local mode (problem log 2026-09-13).
    if (LOCAL_SETTING_KEYS.has(key)) return { ok: false, error: `${key} is a local setting and cannot come from Infisical` };
  }
  return { ok: true, source: { projectId, environment, keys: list } };
}

/** 現在の環境 (注入値 + 暗号化 config 適用後) の取得元。未設定なら null、壊れていれば起動を止める。 */
export function readSecretSource(env: Env = process.env): SecretSource | null {
  const projectId = env.ACTIO_SECRET_PROJECT_ID?.trim();
  if (!projectId) return null;
  const parsed = parseSecretSource(projectId, env.ACTIO_SECRET_ENVIRONMENT?.trim() ?? "", env.ACTIO_SECRET_KEYS ?? "");
  if (!parsed.ok) throw new Error(`Invalid secret source in local config: ${parsed.error}`);
  return parsed.source;
}

export function secretSourceSettings(source: SecretSource): Record<(typeof SECRET_SOURCE_KEYS)[number], string> {
  return {
    ACTIO_SECRET_PROJECT_ID: source.projectId,
    ACTIO_SECRET_ENVIRONMENT: source.environment,
    ACTIO_SECRET_KEYS: source.keys.join(","),
  };
}
