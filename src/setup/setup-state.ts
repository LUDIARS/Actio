/**
 * 起動に必要なローカル設定が揃っているかの判定 (spec/feature/runtime-modernization.md §初回設定)。
 *
 * 判定は「注入値 + 暗号化 config + 取得元から受け取った secret」を合わせた結果に対して行う。
 * ここで見るのは DB 接続先だけ。それ以外の secret の不足は従来どおり起動時エラーにする。
 */
import { parseSecretSource, SECRET_SOURCE_KEYS, secretSourceSettings } from "../config/secret-source.js";

type Env = Record<string, string | undefined>;
type Lookup = (key: string) => string | undefined;

/** 初回設定画面が受け付けるキー。secret そのものは含めない (取得元の指定だけ)。 */
export const SETUP_SETTING_KEYS = ["DB_DIALECT", "DATABASE_URL", "DATABASE_PATH", "REDIS_URL", ...SECRET_SOURCE_KEYS] as const;
export type SetupSettingKey = (typeof SETUP_SETTING_KEYS)[number];
export type SetupSettings = Partial<Record<SetupSettingKey, string>>;

const URL_DIALECT_PROTOCOLS: Record<string, readonly string[]> = {
  postgres: ["postgres:", "postgresql:"],
  mysql: ["mysql:"],
};

/** 起動を止めている不足キー。空なら本体を起動できる。 */
export function missingStartupSettings(get: Lookup = (key) => process.env[key]): SetupSettingKey[] {
  const dialect = get("DB_DIALECT")?.trim() || "postgres";
  // Unknown dialects stay a startup error in db/connection; they are not a setup question.
  if (!(dialect in URL_DIALECT_PROTOCOLS)) return [];
  return get("DATABASE_URL")?.trim() ? [] : ["DATABASE_URL"];
}

/** 初回設定画面は明示的なローカル配備だけで開く。公開配備の設定不足は起動失敗のまま。 */
export function setupScreenAllowed(env: Env = process.env): boolean {
  return env.ACTIO_LOCAL_MODE?.trim() === "1";
}

/** 暗号化 config の鍵が注入されているか (無ければ画面からは保存できない)。 */
export function configKeyAvailable(env: Env = process.env): boolean {
  const key = env.ACTIO_CONFIG_KEY;
  return key !== undefined && Buffer.byteLength(key) >= 32;
}

export type SetupInputResult =
  | { ok: true; settings: SetupSettings; usesSecretSource: boolean }
  | { ok: false; error: string };

/** 画面からの入力を検証する。値そのものはエラー文に含めない。 */
export function parseSetupInput(input: unknown): SetupInputResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "settings must be an object" };
  }
  const settings: SetupSettings = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(SETUP_SETTING_KEYS as readonly string[]).includes(key)) return { ok: false, error: `unsupported setting: ${key}` };
    if (typeof value !== "string") return { ok: false, error: `${key} must be a string` };
    const trimmed = value.trim();
    if (trimmed) settings[key as SetupSettingKey] = trimmed;
  }

  const usesSecretSource = SECRET_SOURCE_KEYS.some((key) => settings[key] !== undefined);
  if (usesSecretSource) {
    const source = parseSecretSource(
      settings.ACTIO_SECRET_PROJECT_ID ?? "", settings.ACTIO_SECRET_ENVIRONMENT ?? "", settings.ACTIO_SECRET_KEYS ?? "",
    );
    if (!source.ok) return { ok: false, error: source.error };
    Object.assign(settings, secretSourceSettings(source.source));
  }

  const dialect = settings.DB_DIALECT ?? "postgres";
  if (dialect !== "sqlite") {
    const protocols = URL_DIALECT_PROTOCOLS[dialect];
    if (!protocols) return { ok: false, error: "DB_DIALECT must be postgres, mysql or sqlite" };
    // With a secret source the database URL may arrive from Infisical; it is checked after the fetch.
    if (!settings.DATABASE_URL && !usesSecretSource) return { ok: false, error: "DATABASE_URL is required" };
    if (settings.DATABASE_URL && !hasProtocol(settings.DATABASE_URL, protocols)) {
      return { ok: false, error: `DATABASE_URL must be a ${dialect} connection URL` };
    }
  }
  if (settings.REDIS_URL && !hasProtocol(settings.REDIS_URL, ["redis:", "rediss:"])) {
    return { ok: false, error: "REDIS_URL must be a redis connection URL" };
  }
  return { ok: true, settings, usesSecretSource };
}

function hasProtocol(value: string, protocols: readonly string[]): boolean {
  try { return protocols.includes(new URL(value).protocol); }
  catch { return false; }
}
