import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { adminDbApi } from "../lib/api";

const PAGE_SIZE = 50;

export function DbViewerPage() {
  const { user } = useAuth();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  // テーブル一覧取得
  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    adminDbApi
      .listTables()
      .then((data) => setTables(data.tables))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  // テーブルデータ取得
  const loadTableData = useCallback(
    (table: string, newOffset = 0) => {
      setLoading(true);
      setError(null);
      adminDbApi
        .getTableData(table, PAGE_SIZE, newOffset)
        .then((data) => {
          setSelectedTable(table);
          setColumns(data.columns);
          setRows(data.rows);
          setTotalRows(data.totalRows);
          setOffset(newOffset);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    []
  );

  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-error)" }}>
        アクセス拒否: 管理者のみ利用可能です
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>
        DB Viewer (テスト用)
      </h1>

      {error && (
        <div
          style={{
            padding: "0.75rem",
            marginBottom: "1rem",
            background: "var(--bg-error)",
            color: "var(--text-error)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {/* テーブル一覧 */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "0.9rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>
          テーブル一覧 ({tables.length})
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {tables.map((t) => (
            <button
              key={t}
              onClick={() => loadTableData(t)}
              style={{
                padding: "0.3rem 0.7rem",
                fontSize: "0.8rem",
                background:
                  selectedTable === t ? "var(--accent)" : "var(--bg-surface)",
                color: selectedTable === t ? "#fff" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* テーブルデータ */}
      {selectedTable && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <h2 style={{ fontSize: "1rem" }}>
              {selectedTable}{" "}
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                ({totalRows} 件)
              </span>
            </h2>

            {/* ページネーション */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                <button
                  disabled={offset === 0 || loading}
                  onClick={() => loadTableData(selectedTable, offset - PAGE_SIZE)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: offset === 0 ? "not-allowed" : "pointer",
                    opacity: offset === 0 ? 0.5 : 1,
                  }}
                >
                  前へ
                </button>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={offset + PAGE_SIZE >= totalRows || loading}
                  onClick={() => loadTableData(selectedTable, offset + PAGE_SIZE)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor:
                      offset + PAGE_SIZE >= totalRows ? "not-allowed" : "pointer",
                    opacity: offset + PAGE_SIZE >= totalRows ? 0.5 : 1,
                  }}
                >
                  次へ
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
              読み込み中...
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.78rem",
                }}
              >
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "0.4rem 0.6rem",
                          textAlign: "left",
                          borderBottom: "2px solid var(--border)",
                          background: "var(--bg-surface)",
                          whiteSpace: "nowrap",
                          fontWeight: 600,
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length}
                        style={{
                          padding: "1.5rem",
                          textAlign: "center",
                          color: "var(--text-muted)",
                        }}
                      >
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          background:
                            i % 2 === 0 ? "transparent" : "var(--bg-surface)",
                        }}
                      >
                        {columns.map((col) => (
                          <td
                            key={col}
                            style={{
                              padding: "0.35rem 0.6rem",
                              borderBottom: "1px solid var(--border)",
                              maxWidth: "300px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={formatCellValue(row[col])}
                          >
                            {formatCellValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
