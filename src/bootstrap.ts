/**
 * bootstrap entry — 設定ファイル無し運用の起動口。
 *
 * ensureEnv() で必要な env を Excubitor / Infisical から取り込んでから
 * 動的に ./index.js を import (top-level の config 読みを後ろにずらす)。
 * ローカル配備で DB 接続先が未設定のときは、本体の代わりに初回設定画面を先に開く。
 */
import { ensureEnv } from './lib/env-bootstrap.js';
import { secretManager } from './config/secrets.js';
import { missingStartupSettings, setupScreenAllowed } from './setup/setup-state.js';

async function bootstrap(): Promise<void> {
  try {
    await ensureEnv();
    // 注入値・暗号化 config・取得元の secret を合わせた結果で判定する。
    const missing = (): string[] => missingStartupSettings((key) => secretManager.get(key));
    if (missing().length > 0) {
      // 公開配備の設定不足は従来どおり起動失敗。画面で補えるのはローカル配備だけ。
      if (!setupScreenAllowed()) throw new Error(`Required settings are missing: ${missing().join(', ')}`);
      const { runInitialSetup } = await import('./setup/setup-server.js');
      await runInitialSetup();
      const stillMissing = missing();
      // 空文字の注入は保存値より優先される。その場合は画面では直せないので止める。
      if (stillMissing.length > 0) throw new Error(`Settings saved but still overridden by an injected empty value: ${stillMissing.join(', ')}`);
    }
  } catch (err) {
    console.error(`[bootstrap] ${(err as Error).message}`);
    process.exit(1);
  }
  await import('./index.js');
}

void bootstrap();
