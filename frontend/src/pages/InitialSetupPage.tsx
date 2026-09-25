import { useEffect, useState, type FormEvent } from "react";
import { setupApi, type InitialSetupSettings, type SetupStatus } from "../lib/api";

interface InitialSetupPageProps { onComplete: () => void }

/** 値の入れ方。infisical は「どこから受け取るか」だけを保存し、値は Excubitor 経由で届く。 */
type SetupMode = "infisical" | "direct";

const ERROR_MESSAGES: Record<string, string> = {
  local_access_required: "この PC から直接開いたときだけ保存できます。",
  config_key_missing: "暗号化の鍵 (ACTIO_CONFIG_KEY) が Excubitor から注入されていません。",
  invalid_settings: "入力内容を確認してください (ID・環境名・キー名・接続 URL の形式)。",
  save_failed: "暗号化 config の保存に失敗しました。保存先の権限を確認してください。",
  secret_no_mapping: "設定は保存しました。Excubitor の Config 画面で actio の Infisical マッピング (同じ project ID・環境・取得キー) を登録してから、もう一度保存してください。",
  mapping_unsupported: "設定は保存しました。この Excubitor は 1 サービス分の登録に対応していないので、Config 画面で actio のマッピングを登録してから、もう一度保存してください。",
  mapping_rejected: "Excubitor がマッピングの内容を受け付けませんでした。project ID・環境名・取得キーの形式を確認してください。",
  mapping_failed: "Excubitor へのマッピング登録に失敗しました。Excubitor のログを確認してください。",
  secret_source_mismatch: "Excubitor 側の actio のマッピングが、ここで入力した project ID / 環境と一致しません。どちらかを直してください。",
  secret_no_identity: "Excubitor に Infisical の machine identity が登録されていません。Excubitor の Config 画面で設定してください。",
  secret_unauthorized: "Excubitor の secret-agent トークンが一致しません。",
  secret_fetch_failed: "Excubitor が Infisical から値を取得できませんでした。project ID と環境名、Excubitor のログを確認してください。",
  secret_bad_response: "Excubitor から想定外の応答が返りました。Excubitor の版を確認してください。",
  excubitor_no_endpoint: "Excubitor の場所 (EXCUBITOR_URL) が注入されていません。Actio を Excubitor から起動してください。",
  excubitor_no_token: "Excubitor の secret-agent トークンが見つかりません。",
  excubitor_unreachable: "Excubitor に接続できませんでした。",
  database_url_missing: "設定は保存しましたが、データベース接続 URL が届いていません。取得キーに DATABASE_URL を含め、Infisical 側に値があるか確認してください。",
};

const BLOCKED_MESSAGES: Record<string, string> = {
  not_local: "初回設定は Actio を動かしている PC から http://127.0.0.1 で開いたときだけ入力できます。",
  config_key_missing: "暗号化の鍵 (ACTIO_CONFIG_KEY、32 バイト以上) を Excubitor から注入してから、Actio を再起動してください。",
};

const DEFAULT_SECRET_KEYS = [
  "DATABASE_URL", "REDIS_URL", "JWT_SECRET",
  "CERNERE_PROJECT_CLIENT_ID", "CERNERE_PROJECT_CLIENT_SECRET", "CERNERE_PROJECT_ID", "CERNERE_PROJECT_SECRET",
].join("\n");

/** 本体が起動し直して状態 API が「設定済み」を返すまで待つ間隔と上限。 */
const RESTART_POLL_MS = 1000;
const RESTART_POLL_LIMIT = 30;

const fieldStyle = { display: "block", width: "100%", marginTop: "0.25rem", padding: "0.5rem" } as const;
const labelStyle = { display: "block", marginBottom: "1rem" } as const;

/** DB 接続先が未設定のローカル配備で最初に出る画面。secret の値そのものは扱わない。 */
export function InitialSetupPage({ onComplete }: InitialSetupPageProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [mode, setMode] = useState<SetupMode>("infisical");
  const [projectId, setProjectId] = useState("");
  const [environment, setEnvironment] = useState("dev");
  const [secretKeys, setSecretKeys] = useState(DEFAULT_SECRET_KEYS);
  const [dialect, setDialect] = useState("postgres");
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [databasePath, setDatabasePath] = useState("data/actio.db");
  const [redisUrl, setRedisUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupApi.getStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  async function waitForRestart(): Promise<boolean> {
    for (let attempt = 0; attempt < RESTART_POLL_LIMIT; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, RESTART_POLL_MS));
      const next = await setupApi.getStatus().catch(() => null);
      if (next && !next.needsSetup) return true;
    }
    return false;
  }

  function buildSettings(): Partial<InitialSetupSettings> {
    if (mode === "infisical") {
      return { DB_DIALECT: dialect, ACTIO_SECRET_PROJECT_ID: projectId, ACTIO_SECRET_ENVIRONMENT: environment, ACTIO_SECRET_KEYS: secretKeys };
    }
    return dialect === "sqlite"
      ? { DB_DIALECT: dialect, DATABASE_PATH: databasePath }
      : { DB_DIALECT: dialect, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await setupApi.saveLocalConfig(buildSettings());
      if (await waitForRestart()) onComplete();
      else setError("保存はできましたが、Actio の起動を確認できません。Excubitor のログを確認してください。");
    } catch (err) {
      const code = (err as Error).message;
      setError(ERROR_MESSAGES[code] ?? code);
    } finally {
      setSaving(false);
    }
  }

  const blocked = status?.canSave === false ? status.saveBlockedReason : null;

  return <main style={{ padding: "2rem", maxWidth: "40rem", margin: "0 auto" }}>
    <h1>Actio の初回設定</h1>
    <p>データベースの接続先がまだ設定されていません。入力した値はこの PC の暗号化 config にだけ保存されます。</p>

    {blocked && <p role="alert">{BLOCKED_MESSAGES[blocked] ?? blocked}</p>}

    <form onSubmit={handleSubmit}>
      <fieldset disabled={saving || Boolean(blocked)} style={{ border: "none", padding: 0 }}>
        <label style={labelStyle}>
          設定の方法
          <select
            value={mode} style={fieldStyle}
            onChange={(e) => {
              const next = e.target.value as SetupMode;
              setMode(next);
              // SQLite はファイルパスを直接入力する方法でしか選べない。
              if (next === "infisical" && dialect === "sqlite") setDialect("postgres");
            }}
          >
            <option value="infisical">Infisical から受け取る (Excubitor 経由)</option>
            <option value="direct">接続先をここに入力する</option>
          </select>
        </label>

        {mode === "infisical" ? (
          <>
            <p style={{ color: "var(--text-muted)" }}>
              保存するのは取得元の指定だけです。Infisical の接続先と認証情報は Excubitor が持ち、Actio には渡りません。
              保存すると、Excubitor の actio 用マッピングにも同じ内容を登録します。
            </p>
            <label style={labelStyle}>
              Infisical の project ID
              <input value={projectId} onChange={(e) => setProjectId(e.target.value)} required autoComplete="off" style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              環境 (environment)
              <input value={environment} onChange={(e) => setEnvironment(e.target.value)} required autoComplete="off" style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              受け取るキー (改行またはカンマ区切り)
              <textarea value={secretKeys} onChange={(e) => setSecretKeys(e.target.value)} required rows={8} style={fieldStyle} />
            </label>
          </>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>認証情報や API キーはここでは扱いません。Excubitor から注入してください。</p>
        )}

        <label style={labelStyle}>
          データベースの種類
          <select value={dialect} onChange={(e) => setDialect(e.target.value)} style={fieldStyle}>
            <option value="postgres">PostgreSQL (既定)</option>
            <option value="mysql">MySQL</option>
            {mode === "direct" && <option value="sqlite">SQLite</option>}
          </select>
        </label>

        {mode === "direct" && (dialect === "sqlite" ? (
          <label style={labelStyle}>
            データベースファイルのパス
            <input value={databasePath} onChange={(e) => setDatabasePath(e.target.value)} required style={fieldStyle} />
          </label>
        ) : (
          <>
            <label style={labelStyle}>
              データベース接続 URL
              <input
                type="password" autoComplete="off" required value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder={dialect === "mysql" ? "mysql://user:password@host:3306/actio" : "postgresql://user:password@host:5432/actio"}
                style={fieldStyle}
              />
            </label>
            <label style={labelStyle}>
              Redis 接続 URL (任意。空なら DB で代替)
              <input
                type="password" autoComplete="off" value={redisUrl}
                onChange={(e) => setRedisUrl(e.target.value)} placeholder="redis://host:6379" style={fieldStyle}
              />
            </label>
          </>
        ))}

        <button type="submit">{saving ? "保存して起動中..." : "保存して起動"}</button>
      </fieldset>
    </form>

    {error && <p role="alert" style={{ color: "var(--danger, #c00)" }}>{error}</p>}
  </main>;
}
