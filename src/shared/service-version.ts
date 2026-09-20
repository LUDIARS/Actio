/**
 * 稼働中プロセスが名乗る版 (RULE_SRE §2 の health 契約)。
 *
 * Excubitor が spawn 時に `EXCUBITOR_SERVICE_VERSION` を注入するのでそれを最優先にし、
 * 外 (docker-compose / 手動起動) では package.json の version を読む。 どちらも無ければ
 * 黙って省略せず、 解決できなかったことが分かる値を返す (Ex 側の突き合わせが unknown になる)。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UNRESOLVED_SERVICE_VERSION = "0.0.0+unresolved";

function readPackageVersion(): string | null {
  // dist/src/shared → dist/src → dist → リポジトリ直下。 実行形態 (tsx / dist) の差を吸収する。
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    resolve(here, "../../package.json"),
    resolve(here, "../../../package.json"),
    resolve(process.cwd(), "package.json"),
  ]) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string; version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // 次の候補へ (実行形態によってどれが当たるかが変わる)。
    }
  }
  return null;
}

let cached: string | undefined;

export function resolveServiceVersion(env: NodeJS.ProcessEnv = process.env): string {
  const injected = env.EXCUBITOR_SERVICE_VERSION?.trim();
  if (injected) return injected;
  cached ??= readPackageVersion() ?? UNRESOLVED_SERVICE_VERSION;
  return cached;
}
