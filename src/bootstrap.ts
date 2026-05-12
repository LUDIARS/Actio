/**
 * bootstrap entry — `.env` ファイル無し運用の起動口。
 *
 * ensureEnv() で必要な env を Excubitor / Infisical から取り込んでから
 * 動的に ./index.js を import (top-level の config 読みを後ろにずらす)。
 */
import { ensureEnv } from './lib/env-bootstrap.js';

async function bootstrap(): Promise<void> {
  try {
    await ensureEnv();
  } catch (err) {
    console.error(`[bootstrap] ${(err as Error).message}`);
    process.exit(1);
  }
  await import('./index.js');
}

void bootstrap();
