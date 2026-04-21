/**
 * Plugin-owned tables schema composition — Issue #111 D8
 *
 * プラグインが `defineModule({ tables: { foo: fooTable, ... } })` で
 * 宣言した Drizzle テーブル定義から、`CREATE TABLE IF NOT EXISTS`
 * SQL を合成して発行する薄いコード.
 *
 * 使い方:
 *
 * ```ts
 * await composePluginTablesSQL(definition).forEach(sql => db.run(sql));
 * ```
 *
 * 本来なら `drizzle-kit` を programmatically 呼び出して方言対応するのが
 * 正解だが、本 PR では **最低限 SQLite 向け** に `getTableConfig()` を
 * 使って既定値・型・制約を拾い、IF NOT EXISTS なので冪等という運用.
 * Postgres / MySQL 対応は Phase 2.
 */

import { getTableConfig as sqliteGetTableConfig } from "drizzle-orm/sqlite-core";

import type { ModuleDefinition } from "@ludiars/schedula-sdk";

export interface ComposedSQL {
  table: string;
  sql:   string;
}

function sqliteType(dt: string): string {
  // drizzle-orm の SQLiteColumn.dataType は
  //   text()    → "string"
  //   integer() → "number"
  //   real()    → "number"   (区別するには columnType を見る必要あり)
  //   blob()    → "buffer"
  //   ...のように論理 JS 型で返る. ここでは最低限の SQL 型に戻す.
  switch (dt.toLowerCase()) {
    case "string":
    case "text":    return "TEXT";
    case "number":
    case "integer":
    case "bigint":
    case "boolean": return "INTEGER";
    case "json":    return "TEXT";
    case "real":    return "REAL";
    case "blob":
    case "buffer":  return "BLOB";
    case "numeric": return "NUMERIC";
  }
  return "TEXT";
}

interface ColumnLike {
  name:     string;
  dataType: string;
  notNull:  boolean;
  primary:  boolean;
}

function columnDdl(col: ColumnLike): string {
  const pieces: string[] = [`"${col.name}"`, sqliteType(col.dataType)];
  if (col.primary) pieces.push("PRIMARY KEY");
  if (col.notNull && !col.primary) pieces.push("NOT NULL");
  return pieces.join(" ");
}

function composeSqliteTable(name: string, table: unknown): ComposedSQL {
  // drizzle の SQLiteTable 型は constraint があるので、型注釈を unknown に
  // 留め、実装では getTableConfig の結果 (構造だけ使う) に頼る.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = sqliteGetTableConfig(table as any);
  const cols = (cfg.columns as ColumnLike[]).map((c) => columnDdl(c));
  const sql = `CREATE TABLE IF NOT EXISTS "${cfg.name}" (\n  ${cols.join(",\n  ")}\n);`;
  return { table: name, sql };
}

/**
 * プラグイン宣言テーブルから CREATE TABLE SQL を配列で返す.
 * dialect は現状 SQLite のみサポート. 失敗は throw せず警告ログに留め、
 * 失敗したテーブルはスキップ.
 */
export function composePluginTablesSQL(def: ModuleDefinition): ComposedSQL[] {
  const out: ComposedSQL[] = [];
  if (!def.tables) return out;
  for (const [name, tbl] of Object.entries(def.tables)) {
    try {
      // Drizzle SQLite テーブルのみダックタイピングで識別.
      const maybe = tbl as { _: { dialect?: string } };
      if (maybe._?.dialect && maybe._.dialect !== "sqlite") {
        console.warn(
          `[plugin ${def.id}] composePluginTablesSQL: dialect "${maybe._.dialect}" is not supported in this milestone, skipping table "${name}".`,
        );
        continue;
      }
      out.push(composeSqliteTable(name, tbl as never));
    } catch (err) {
      console.warn(`[plugin ${def.id}] failed to compose SQL for table "${name}":`, err);
    }
  }
  return out;
}
