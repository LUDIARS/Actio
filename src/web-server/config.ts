/**
 * actio-web の起動設定。frontend/vite.config.ts の preview 設定と同じ env から同じ値を作る。
 * Excubitor が catalog の port から ACTIO_WEB_PORT / ACTIO_PORT / ACTIO_URL を注入する。
 * FRONTEND_PORT / BACKEND_PORT は Excubitor 外の起動用に残す。
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface WebServerConfig {
  readonly host: string;
  readonly port: number;
  readonly distDir: string;
  readonly backendUrl: URL;
  /** ローカルモードでは Host を書き換えない (backend が Access の公開 origin を見るため)。 */
  readonly changeOrigin: boolean;
  readonly allowedHosts: readonly string[];
}

type Env = Readonly<Record<string, string | undefined>>;

function splitList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** dist/src/web-server/ からも src/web-server/ からも Actio ルートの frontend/dist を指す。 */
export function defaultDistDir(moduleUrl: string): string {
  const here = dirname(fileURLToPath(moduleUrl));
  const compiled = here.split(/[\\/]/).slice(-3)[0] === "dist";
  const root = compiled ? resolve(here, "../../..") : resolve(here, "../..");
  return resolve(root, "frontend", "dist");
}

export function loadWebServerConfig(env: Env, moduleUrl: string): WebServerConfig {
  const localMode = env.ACTIO_LOCAL_MODE === "1";
  const backendHost = localMode ? "127.0.0.1" : "localhost";
  const backendPort = env.ACTIO_PORT || env.BACKEND_PORT || "3000";
  const backendTarget = env.ACTIO_URL || env.ACTIO_BACKEND_URL || `http://${backendHost}:${backendPort}`;
  const cfPublicHost = env.ACTIO_CF_PUBLIC_ORIGIN ? new URL(env.ACTIO_CF_PUBLIC_ORIGIN).hostname : null;
  return {
    host: localMode ? "127.0.0.1" : "0.0.0.0",
    port: parseInt(env.ACTIO_WEB_PORT || env.FRONTEND_PORT || "5173", 10),
    distDir: env.ACTIO_WEB_DIST_DIR ? resolve(env.ACTIO_WEB_DIST_DIR) : defaultDistDir(moduleUrl),
    backendUrl: new URL(backendTarget),
    changeOrigin: !localMode,
    allowedHosts: [
      ...(cfPublicHost ? [cfPublicHost] : []),
      ...splitList(env.VITE_ALLOWED_HOSTS),
      ...splitList(env.LUDIARS_ALLOWED_HOSTS),
    ],
  };
}
