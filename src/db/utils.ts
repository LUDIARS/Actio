/**
 * DB ユーティリティ関数
 *
 * 複数の方言 (SQLite, PostgreSQL, MySQL) に対応した共通ヘルパー。
 */

/**
 * db.execute() の結果を行の配列に正規化する。
 * - SQLite (better-sqlite3): { rows: T[] } を返す
 * - PostgreSQL (postgres.js): 行の配列を直接返す (RowList)
 * - MySQL (mysql2): [rows, fields] のタプルを返す
 */
export function extractRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    // mysql2 は [rows, fields] を返す
    if (result.length === 2 && Array.isArray(result[0])) {
      return result[0] as Record<string, unknown>[];
    }
    // postgres.js は RowList (Array-like) を返す
    return result as Record<string, unknown>[];
  }
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown[] }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}
