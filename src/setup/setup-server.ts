/**
 * 初回設定モードの待受。設定が保存されるまで本体と同じポートで待ち、
 * 保存後は待受を閉じてから呼び出し元へ戻す (本体が同じポートを使うため)。
 */
import { serve } from "@hono/node-server";
import { ExcubitorUnavailableError } from "../config/excubitor/endpoint.js";
import { MappingRegistrationError, registerSecretSourceWithExcubitor } from "../config/excubitor/mapping-client.js";
import { SecretAgentError } from "../config/excubitor/secret-agent-client.js";
import { readLocalConfig, writeLocalConfig } from "../config/local-config.js";
import { readSecretSource } from "../config/secret-source.js";
import { secretManager } from "../config/secrets.js";
import { resolveBackendPort } from "../config/service-endpoints.js";
import { createSetupApp, SetupSaveError } from "./setup-app.js";
import { configKeyAvailable, missingStartupSettings, type SetupSettings } from "./setup-state.js";

/** 応答を返し終える前に待受を閉じないための猶予。 */
const RESPONSE_FLUSH_MS = 200;

/**
 * 保存して、起動できる状態になったことまで確かめる。
 * 失敗しても保存した設定は残す (Excubitor 側を直してから同じ内容で保存し直せるように)。
 */
function createSaver(injectedKeys: ReadonlySet<string>): (settings: SetupSettings) => Promise<void> {
  return async (settings) => {
    // 既存の暗号化 config にある他の設定は保持し、画面の入力だけを上書きする。
    writeLocalConfig({ ...readLocalConfig(), ...settings });
    for (const [key, value] of Object.entries(settings)) {
      // 起動元が注入した値は保存値より優先する。前回の保存で入れた値だけを置き換える。
      if (!injectedKeys.has(key)) process.env[key] = value;
    }
    try {
      // 取得元を指定したときは、Excubitor 側の actio マッピングもここで揃える (別画面での手作業を不要にする)。
      const source = readSecretSource();
      if (source) await registerSecretSourceWithExcubitor(source);
      await secretManager.reinit();
    } catch (err) {
      if (err instanceof MappingRegistrationError) throw new SetupSaveError(`mapping_${err.code}`, err.code === "failed" ? 502 : 409);
      if (err instanceof SecretAgentError) throw new SetupSaveError(`secret_${err.code}`, err.code === "no_mapping" || err.code === "source_mismatch" ? 409 : 502);
      if (err instanceof ExcubitorUnavailableError) throw new SetupSaveError(`excubitor_${err.code}`, 502);
      throw err;
    }
    if (missingStartupSettings((key) => secretManager.get(key)).length > 0) throw new SetupSaveError("database_url_missing", 409);
  };
}

/** 設定が揃うまで待つ。戻った時点で待受は解放済み、設定と secret は読み込み済み。 */
export async function runInitialSetup(): Promise<void> {
  const port = resolveBackendPort();
  // 暗号化 config から入った値は「注入」ではない (同じ画面で上書きできる必要がある)。
  const stored = readLocalConfig();
  const injectedKeys = new Set(Object.keys(process.env).filter((key) => stored[key] === undefined || stored[key] !== process.env[key]));
  let configured: () => void = () => undefined;
  const untilConfigured = new Promise<void>((resolve) => { configured = resolve; });

  const app = createSetupApp({
    missing: () => missingStartupSettings((key) => secretManager.get(key)),
    canEncrypt: () => configKeyAvailable(),
    save: createSaver(injectedKeys),
    onConfigured: () => setTimeout(configured, RESPONSE_FLUSH_MS),
  });

  // 初回設定はローカル配備専用なので loopback だけで待ち受ける。
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.warn(`[setup] Actio is not configured; initial setup is waiting on http://127.0.0.1:${info.port}`);
  });

  try {
    await untilConfigured;
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // The proxy keeps connections alive; without this the port is never released.
      if ("closeAllConnections" in server) server.closeAllConnections();
    });
  }
  console.log("[setup] local config saved; starting Actio");
}
