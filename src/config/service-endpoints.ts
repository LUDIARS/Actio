/**
 * Excubitor が catalog から配る接続先 (topology env) を Actio の設定キーへ写す。
 *
 * - `ACTIO_PORT` / `ACTIO_URL` は actio サービスの port と provides から、
 *   `ACTIO_FRONTEND_URL` は actio-web サービスの provides から Excubitor が注入する。
 * - Excubitor の値がある時はそれを正とし、旧キーより優先する。
 * - Excubitor 外の起動 (docker-compose) のためだけに旧キーを残す。
 */

type Env = Record<string, string | undefined>;

/** Excubitor の注入キー → Actio が内部で読むキー。 */
const EXCUBITOR_ENDPOINT_KEYS: ReadonlyArray<readonly [from: string, to: string]> = [
  ["ACTIO_PORT", "BACKEND_PORT"],
  ["ACTIO_URL", "ACTIO_PUBLIC_URL"],
  ["ACTIO_FRONTEND_URL", "FRONTEND_URL"],
];

export function applyExcubitorEndpoints(env: Env = process.env): void {
  for (const [from, to] of EXCUBITOR_ENDPOINT_KEYS) {
    const value = env[from]?.trim();
    if (value) env[to] = value;
  }
}

/** バックエンドの待受ポート。 不正値は起動を止める。 */
export function resolveBackendPort(env: Env = process.env): number {
  const port = Number(env.BACKEND_PORT || env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Excubitor must inject a valid ACTIO_PORT (catalog port of the actio service)");
  }
  return port;
}
