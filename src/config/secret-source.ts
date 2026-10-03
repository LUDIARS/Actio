/**
 * Vault から受け取るキーの設定。値は Excubitor の secret-agent が解決する。
 */
import { LOCAL_SETTING_KEYS } from "./local-config.js";
import { contract } from '../contract-runtime.js'; /* augur-inject:import:2363e746 */
import augurContract_62c02555 from '../../contracts/vault-secret-source.contract.ts'; /* augur-inject:contract-predicate:7eecbfac */

type Env = Record<string, string | undefined>;

export const SECRET_SOURCE_KEYS = ["ACTIO_SECRET_KEYS"] as const;

export interface SecretSource {
  /** Excubitor に取得を許すキー。全量取得はしない (ローカルモードの URL 等と衝突するため)。 */
  keys: string[];
}

const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_SECRET_KEYS = 64;

export type SecretSourceResult = { ok: true; source: SecretSource } | { ok: false; error: string };

/** 入力や保存値を検証して取得元にする。エラー文に値は含めない。 */
export function parseSecretSource(keys: string): SecretSourceResult {
  const list = [...new Set(keys.split(/[\s,]+/).filter((key) => key.length > 0))];
  if (list.length === 0) return { ok: false, error: "at least one secret key is required" };
  if (list.length > MAX_SECRET_KEYS) return { ok: false, error: "too many secret keys" };
  for (const key of list) {
    if (!SECRET_KEY_PATTERN.test(key)) return { ok: false, error: "secret keys must be UPPER_SNAKE_CASE names" };
    // Deployment settings stay local; a remote value once broke local mode (problem log 2026-09-13).
    if (LOCAL_SETTING_KEYS.has(key)) return { ok: false, error: `${key} is a local setting and cannot come from Vault` };
  }
  return { ok: true, source: { keys: list } };
}
// @ts-expect-error augur-inject
parseSecretSource = contract(parseSecretSource, { ...augurContract_62c02555, contractId: 'C-3', mode: 'observe', sample: 1, where: 'src/config/secret-source.ts:21', rule: 'contract-wrap', id: '62c02555' }); /* augur-inject:contract-wrap:62c02555 */

/** 現在の環境 (注入値 + 暗号化 config 適用後) の取得元。未設定なら null、壊れていれば起動を止める。 */
export function readSecretSource(env: Env = process.env): SecretSource | null {
  const keys = env.ACTIO_SECRET_KEYS;
  if (!keys?.trim()) return null;
  const parsed = parseSecretSource(keys);
  if (!parsed.ok) throw new Error(`Invalid secret source in local config: ${parsed.error}`);
  return parsed.source;
}

export function secretSourceSettings(source: SecretSource): Record<(typeof SECRET_SOURCE_KEYS)[number], string> {
  return {
    ACTIO_SECRET_KEYS: source.keys.join(","),
  };
}
