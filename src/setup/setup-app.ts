/**
 * 初回設定モードの HTTP 面。本体 (DB / 認証) を読み込めない間だけ使う最小アプリ。
 *
 * 保存を受け付けるのは「この PC からの直接アクセス」だけ。トンネル経由や LAN からは
 * 状態の参照しかできない。secret は受け付けず、DB / Redis の接続先だけを扱う。
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { allowsLocalRequest } from "../auth/local-mode-policy.js";
import { resolveServiceVersion } from "../shared/service-version.js";
import { parseSetupInput, type SetupSettingKey, type SetupSettings } from "./setup-state.js";

export interface SetupAppDeps {
  /** 現在不足しているキー。 */
  missing: () => SetupSettingKey[];
  /** 暗号化 config の鍵が注入済みか。 */
  canEncrypt: () => boolean;
  /** 検証済みの設定を保存し、起動できる状態になったことまで確かめる。直せる失敗は SetupSaveError で返す。 */
  save: (settings: SetupSettings) => Promise<void>;
  /** 保存に成功し、本体を起動できる状態になった。 */
  onConfigured: () => void;
  /** 要求がこの PC からの直接アクセスか。既定はソケットの実アドレスで判定する (テストで差し替える)。 */
  isDirectLocalRequest?: (c: Context) => boolean;
}

/** 画面に理由を出せる保存失敗。code は固定の分類だけで、値や上流の詳細は含めない。 */
export class SetupSaveError extends Error {
  constructor(readonly code: string, readonly status: 409 | 502) {
    super(code);
    this.name = "SetupSaveError";
  }
}

function socketIsDirectLocal(c: Context): boolean {
  // Non-Node callers have no trustworthy socket and must not gain local access.
  try { return allowsLocalRequest(getConnInfo(c).remote.address, c.req.raw); }
  catch { return false; }
}

export function createSetupApp(deps: SetupAppDeps): Hono {
  const app = new Hono();
  const isDirectLocalRequest = deps.isDirectLocalRequest ?? socketIsDirectLocal;
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  // Excubitor には「起動はしたが未設定」と見せる。200 を返すと設定済みと誤認される。
  app.get("/api/health", (c) => c.json({
    status: "needs_setup", service: "actio", version: resolveServiceVersion(), timestamp: new Date().toISOString(),
  }, 503));

  app.get("/api/setup/status", (c) => {
    const direct = isDirectLocalRequest(c);
    return c.json({
      needsSetup: true,
      configurationMode: "initial-setup",
      missing: deps.missing(),
      canSave: direct && deps.canEncrypt(),
      saveBlockedReason: !direct ? "not_local" : deps.canEncrypt() ? null : "config_key_missing",
      infisicalConfigured: false, ssmConfigured: false, providerType: "env", setupSkipped: false,
    });
  });

  app.post("/api/setup/local-config", async (c) => {
    if (!isDirectLocalRequest(c)) return c.json({ error: "local_access_required" }, 403);
    if (!deps.canEncrypt()) return c.json({ error: "config_key_missing" }, 409);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = parseSetupInput(body);
    if (!parsed.ok) return c.json({ error: "invalid_settings", detail: parsed.error }, 400);
    try { await deps.save(parsed.settings); }
    catch (err) {
      if (err instanceof SetupSaveError) return c.json({ error: err.code }, err.status);
      // The cause may quote a connection string; never echo it to the browser or the log.
      console.error("[setup] failed to save the encrypted local config");
      return c.json({ error: "save_failed" }, 500);
    }
    deps.onConfigured();
    return c.json({ ok: true, restarting: true });
  });

  app.all("*", (c) => c.json({ error: "needs_setup" }, 503));
  return app;
}
