/**
 * Cernere project schema 同期
 *
 * 各モジュールの manifest.userData を収集し、Cernere の
 * `managed_project.update_schema` で Schedula プロジェクトのカラム定義を
 * 更新する。起動時 + install/uninstall 時に呼ばれる。
 *
 * 重要: Cernere 側の DROP COLUMN 禁止ルールに従い、manifest から消えた
 * カラムは `_deleted: true` フラグが付与される (既存 Cernere 実装の挙動)。
 */

import type { UserDataColumn } from "@ludiars/schedula-sdk";
import { moduleRegistry } from "./registry.js";
import { updateProjectSchema } from "../auth/cernere-client.js";
import { secretManager } from "../config/secrets.js";

const PROJECT_KEY = "schedula";

interface CernereColumn {
  type: string;
  module: string;
  description?: string;
}

/** lowerCamel → snake_case */
function snake(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/** SDK の UserDataColumn を Cernere の column 定義に変換 */
function toCernereColumn(
  moduleId: string,
  col: UserDataColumn,
): CernereColumn {
  // SDK は "text" | "boolean" | "integer" | "json" | "timestamp" を提供。
  // Cernere も同じ型名を受理する想定 (schema 正規化は Cernere 側)。
  return {
    type: col.type,
    module: moduleId,
    ...(col.description ? { description: col.description } : {}),
  };
}

/**
 * 全ロード済みモジュールから userData を収集して Cernere に反映する。
 * CERNERE_URL 未設定時は no-op。
 */
export async function syncProjectSchemaToCernere(): Promise<void> {
  const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
  if (!cernereUrl) {
    console.log("[plugin] CERNERE_URL 未設定 — schema sync をスキップ");
    return;
  }

  const columns: Record<string, CernereColumn> = {};
  for (const loaded of moduleRegistry.list()) {
    const ud = loaded.definition.userData;
    if (!ud) continue;
    for (const [key, col] of Object.entries(ud)) {
      const cernereKey = `${loaded.definition.id}:${snake(key)}`;
      columns[cernereKey] = toCernereColumn(loaded.definition.id, col);
    }
  }

  const definition = {
    project: { key: PROJECT_KEY, name: "Schedula" },
    user_data: { columns },
  };

  try {
    const res = await updateProjectSchema(definition);
    console.log(
      `[plugin] Cernere schema synced: ${res.columnsAdded.length} columns added (${res.columnsAdded.join(", ") || "none"})`,
    );
  } catch (err) {
    console.warn("[plugin] Cernere schema sync failed:", err);
  }
}
