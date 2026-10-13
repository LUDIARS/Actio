// 処理されない「接続が切れた」失敗でプロセス全体を落とさないための受け止め役。
//
// 2026-09-19、PostgreSQL / Redis / 外部 fetch いずれかのソケットが ECONNRESET で切れ、
// その失敗を誰も catch していなかった Promise が unhandledRejection としてプロセスを終了させた
// (spec/tasks/2026-09-19-unhandled-econnreset-crash.md)。postgres.js は接続が落ちると待ち行列の
// クエリを素の socket エラーで reject するため、後始末の無い呼び出しが 1 つあるだけで落ちる。
//
// 接続断は依存先の都合で普通に起こる。その要求だけが失敗すればよいので、接続断と分かる
// unhandledRejection は記録して握りつぶす。それ以外の失敗は従来どおりプロセスを落とす
// (未知の不具合を黙って生き延びさせない)。

/** 接続が切れた・張れなかったことを表す Node の errno コード。 */
const CONNECTION_DROP_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EAI_AGAIN",
]);

/** 原因を辿る深さの上限 (cause の循環で止まらないように)。 */
const MAX_CAUSE_DEPTH = 5;

/** 接続断のエラーなら、そのコードを返す。ラッパー (drizzle / fetch) の cause も辿る。 */
export function connectionDropCode(reason: unknown): string | null {
  let current: unknown = reason;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_DROP_CODES.has(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export interface ConnectionDropRecord {
  /** 最後に握りつぶした接続断のコード。 */
  readonly code: string;
  /** その時刻 (UTC ISO 8601)。 */
  readonly at: string;
  /** 起動からの累計件数。 */
  readonly count: number;
}

let lastDrop: ConnectionDropRecord | null = null;

/** health に載せる、直近に握りつぶした接続断。一度も無ければ null。 */
export function lastConnectionDrop(): ConnectionDropRecord | null {
  return lastDrop;
}

/** unhandledRejection を受けられる最小の口 (テストでは EventEmitter を渡す)。 */
export interface RejectionSource {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
}

export interface ConnectionDropGuardOptions {
  readonly now?: () => Date;
  readonly warn?: (message: string) => void;
}

/**
 * unhandledRejection の受け止め役を付ける。接続断は記録して続行し、それ以外は投げ直して
 * 従来どおりプロセスを落とす (listener 内で throw すると uncaughtException になる)。
 */
export function installConnectionDropGuard(source: RejectionSource, options: ConnectionDropGuardOptions = {}): void {
  const now = options.now ?? (() => new Date());
  const warn = options.warn ?? ((message: string) => console.warn(message));
  source.on("unhandledRejection", (reason: unknown) => {
    const code = connectionDropCode(reason);
    if (code === null) throw reason;
    lastDrop = { code, at: now().toISOString(), count: (lastDrop?.count ?? 0) + 1 };
    const detail = reason instanceof Error ? reason.message : String(reason);
    warn(`[connection-drop] 処理されない接続断を受け止めました (${code}): ${detail}`);
  });
}

/** テスト用: 記録を消す。 */
export function resetConnectionDropRecord(): void {
  lastDrop = null;
}
