/**
 * Excubitor の runtime-config (サービス別の暗号化 config) を受け取る。
 *
 * Excubitor は個別の環境変数ではなく、`EXCUBITOR_SERVICE_CONFIG_JSON` 1 つに JSON で
 * まとめて渡す (Excubitor src/process/inject.ts)。ここで展開して、明示注入されていない
 * キーだけを process.env に載せる。ACTIO_CONFIG_KEY など、平文ファイルに置きたくない
 * ローカル値の受け渡し口。値はログに出さない。
 */

type Env = Record<string, string | undefined>;

export const EXCUBITOR_SERVICE_CONFIG_ENV = "EXCUBITOR_SERVICE_CONFIG_JSON";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** 展開したキー名を返す (値は返さない)。壊れた JSON は起動を止める (黙って無視しない)。 */
export function applyExcubitorServiceConfig(env: Env = process.env): string[] {
  const raw = env[EXCUBITOR_SERVICE_CONFIG_ENV];
  if (raw === undefined || raw.trim() === "") return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`${EXCUBITOR_SERVICE_CONFIG_ENV} is not valid JSON`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${EXCUBITOR_SERVICE_CONFIG_ENV} must be a JSON object`);
  }
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (!KEY_PATTERN.test(key) || typeof value !== "string") continue;
    // An explicitly injected variable (catalog env or the launcher) outranks the stored config.
    if (env[key] !== undefined) continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}
