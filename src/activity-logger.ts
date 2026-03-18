/**
 * Activity Logger — ファイルベースの操作ログ
 *
 * DB更新操作 (POST/PUT) のログをファイルに記録し、
 * 管理画面から最新のログを確認できるようにする。
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "activity.log");

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

export interface ActivityLogEntry {
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  detail: string;
}

/**
 * 操作ログを記録する
 */
export function logActivity(
  userId: string,
  userName: string,
  action: string,
  detail: string
) {
  ensureLogDir();
  const entry: ActivityLogEntry = {
    timestamp: new Date().toISOString(),
    userId,
    userName,
    action,
    detail,
  };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

/**
 * 最新のログを取得する（新しい順）
 */
export function getRecentLogs(limit = 50): ActivityLogEntry[] {
  if (!existsSync(LOG_FILE)) return [];

  const content = readFileSync(LOG_FILE, "utf-8").trim();
  if (!content) return [];

  const lines = content.split("\n");
  const entries: ActivityLogEntry[] = [];

  // 末尾から読み取ることで新しい順にする
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      entries.push(JSON.parse(lines[i]));
    } catch {
      // 壊れた行はスキップ
    }
  }

  return entries;
}
