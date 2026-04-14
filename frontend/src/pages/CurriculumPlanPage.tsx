import { useState, useCallback, useRef, useEffect } from "react";
import { DAY_LABELS, PERIODS_COUNT, getPeriodLabel } from "../lib/constants";
import { m1 } from "../lib/api";

// ─── Types ──────────────────────────────────────────────────

interface PlanBlock {
  id: string;
  curriculumName: string;
  sessionNumber: number;
  blockSize: number;
  color: string;
  placementStatus: "placed" | "unplaced" | "error";
  day: number | null;
  period: number | null;
  errorMessage: string | null;
}

interface Curriculum {
  id: string;
  name: string;
  departmentName: string;
  instructorName: string;
  slotsPerSession: number;
  totalSessions: number;
  color: string;
}

// Color palette for curricula
const BLOCK_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#6366f1", "#f43f5e", "#14b8a6", "#a855f7", "#ef4444",
];

// ─── Component ──────────────────────────────────────────────

export function CurriculumPlanPage() {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [blocks, setBlocks] = useState<PlanBlock[]>([]);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [highlightSlot, setHighlightSlot] = useState<{ day: number; period: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  // M1のデータを読み込む - async fetch without synchronous setState
  const fetchM1Data = useCallback(async () => {
    try {
      const result = await m1.getSchedule();
      const entries = result.entries || [];

      if (entries.length === 0) {
        setError("M1にデータがありません。先にデータ管理でデータを登録してください。");
        setLoading(false);
        return;
      }

      // M1のエントリからカリキュラムとブロックを構築
      const currMap = new Map<string, Curriculum>();
      const blockList: PlanBlock[] = [];
      let colorIdx = 0;

      for (const entry of entries) {
        const cId = entry.curriculumId;
        if (!currMap.has(cId)) {
          currMap.set(cId, {
            id: cId,
            name: entry.curriculumName || cId.slice(0, 8),
            departmentName: "",
            instructorName: entry.instructorName || entry.instructorId || "",
            slotsPerSession: 1,
            totalSessions: 0,
            color: BLOCK_COLORS[colorIdx % BLOCK_COLORS.length],
          });
          colorIdx++;
        }
        const curr = currMap.get(cId)!;
        curr.totalSessions++;

        blockList.push({
          id: `${cId}-${curr.totalSessions}`,
          curriculumName: curr.name,
          sessionNumber: curr.totalSessions,
          blockSize: 1,
          color: curr.color,
          placementStatus: entry.isConfirmed ? "placed" : "unplaced",
          day: entry.day ?? null,
          period: entry.period ?? null,
          errorMessage: null,
        });
      }

      setCurricula(Array.from(currMap.values()));
      setBlocks(blockList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "M1データの読み込みに失敗しました");
    }
    setLoading(false);
  }, []);

  // Initial load (loading starts as true)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchM1Data();
  }, [fetchM1Data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reload handler for button clicks (sets loading synchronously)
  const loadFromM1 = () => {
    setLoading(true);
    setError("");
    fetchM1Data();
  };

  // Get block at a specific grid position
  const getBlockAt = useCallback(
    (day: number, period: number) => {
      return blocks.find(
        (b) =>
          b.placementStatus === "placed" &&
          b.day === day &&
          b.period !== null &&
          period >= b.period &&
          period < b.period + b.blockSize
      );
    },
    [blocks]
  );

  // Check if a slot is a continuation of a multi-slot block
  const isBlockContinuation = useCallback(
    (day: number, period: number) => {
      const block = getBlockAt(day, period);
      return block ? block.period !== period : false;
    },
    [getBlockAt]
  );

  // Check if placing a block at a position would cause conflicts
  const canPlace = useCallback(
    (block: PlanBlock, day: number, period: number) => {
      if (period + block.blockSize > PERIODS_COUNT) return false;
      for (let p = period; p < period + block.blockSize; p++) {
        const existing = getBlockAt(day, p);
        if (existing && existing.id !== block.id) return false;
      }
      return true;
    },
    [getBlockAt]
  );

  // Place a block at a grid position
  const placeBlock = useCallback(
    (blockId: string, day: number, period: number) => {
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== blockId) return b;
          if (!canPlace(b, day, period)) {
            return { ...b, placementStatus: "error" as const, day: null, period: null, errorMessage: "配置不可: コマが重複しています" };
          }
          return { ...b, placementStatus: "placed" as const, day, period, errorMessage: null };
        })
      );
    },
    [canPlace]
  );

  // Remove block from grid
  const unplaceBlock = useCallback((blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, placementStatus: "unplaced" as const, day: null, period: null, errorMessage: null }
          : b
      )
    );
  }, []);

  // Drag handlers
  const handleDragStart = (blockId: string) => {
    setDraggedBlockId(blockId);
  };

  const handleDragOver = (e: React.DragEvent, day: number, period: number) => {
    e.preventDefault();
    setHighlightSlot({ day, period });
  };

  const handleDrop = (e: React.DragEvent, day: number, period: number) => {
    e.preventDefault();
    setHighlightSlot(null);
    if (draggedBlockId) {
      placeBlock(draggedBlockId, day, period);
      setDraggedBlockId(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedBlockId(null);
    setHighlightSlot(null);
  };

  // Filter blocks by status
  const unplacedBlocks = blocks.filter((b) => b.placementStatus === "unplaced");
  const errorBlocks = blocks.filter((b) => b.placementStatus === "error");
  const placedCount = blocks.filter((b) => b.placementStatus === "placed").length;

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1>M2 カリキュラムプラン</h1>
          <p>M1のデータを読み込み中...</p>
        </div>
        <div className="empty-state">読み込み中...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>M2 カリキュラムプラン</h1>
        <p>
          M1で登録したデータを元に、ブロックをドラッグして時間割を組み立てます
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(248, 81, 73, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      )}

      {/* Stats & Actions */}
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <span className="badge green">配置済み: {placedCount}</span>
        <span className="badge orange">未配置: {unplacedBlocks.length}</span>
        {errorBlocks.length > 0 && (
          <span className="badge red">エラー: {errorBlocks.length}</span>
        )}
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>
          全{blocks.length}ブロック
        </span>
        <button onClick={loadFromM1} style={{ fontSize: "0.8rem" }}>
          M1データ再読込
        </button>
      </div>

      {/* Grid (Calendar) */}
      <div ref={gridRef} className="grid-7x11" style={{ marginBottom: "1.5rem" }}>
        {/* Header row */}
        <div className="header-cell" />
        {DAY_LABELS.map((d) => (
          <div key={d} className="header-cell">{d}</div>
        ))}

        {/* Period rows */}
        {Array.from({ length: PERIODS_COUNT }, (_, period) => (
          <>
            <div key={`label-${period}`} className="period-label">
              {getPeriodLabel(period)}
            </div>
            {Array.from({ length: 7 }, (_, day) => {
              const block = getBlockAt(day, period);
              const isContinuation = isBlockContinuation(day, period);
              const isHighlight =
                highlightSlot?.day === day && highlightSlot?.period === period;

              if (isContinuation) {
                return (
                  <div
                    key={`${day}-${period}`}
                    className="slot-cell"
                    style={{
                      background: block ? block.color : "var(--bg-surface)",
                      opacity: 0.7,
                      borderTop: "none",
                    }}
                    onDragOver={(e) => handleDragOver(e, day, period)}
                    onDrop={(e) => handleDrop(e, day, period)}
                  />
                );
              }

              return (
                <div
                  key={`${day}-${period}`}
                  className="slot-cell"
                  style={{
                    background: block
                      ? block.color
                      : isHighlight
                        ? "var(--bg-surface-2)"
                        : "var(--bg-surface)",
                    cursor: block ? "grab" : "default",
                    position: "relative",
                    outline: isHighlight ? "2px dashed var(--accent)" : "none",
                    outlineOffset: -2,
                  }}
                  draggable={!!block}
                  onDragStart={() => block && handleDragStart(block.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, day, period)}
                  onDrop={(e) => handleDrop(e, day, period)}
                  onDragLeave={() => setHighlightSlot(null)}
                  onClick={() => block && unplaceBlock(block.id)}
                  title={
                    block
                      ? `${block.curriculumName} 第${block.sessionNumber}回 (クリックで取り外し)`
                      : `${DAY_LABELS[day]} ${period + 1}限`
                  }
                >
                  {block && (
                    <div style={{ fontSize: "0.65rem", lineHeight: 1.2, color: "#fff" }}>
                      <div style={{ fontWeight: 600 }}>
                        {block.curriculumName}
                      </div>
                      <div style={{ opacity: 0.8 }}>第{block.sessionNumber}回</div>
                      {block.blockSize > 1 && (
                        <div style={{ opacity: 0.6 }}>{block.blockSize}コマ</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {/* Unplaced blocks area */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1rem",
          marginBottom: "1rem",
        }}
      >
        <h3 style={{ fontSize: "0.9rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          未配置ブロック
        </h3>
        {unplacedBlocks.length === 0 ? (
          <div className="empty-state" style={{ padding: "1rem" }}>
            全てのブロックが配置されました
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            {unplacedBlocks.map((block) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => handleDragStart(block.id)}
                onDragEnd={handleDragEnd}
                style={{
                  background: block.color,
                  color: "#fff",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  cursor: "grab",
                  minWidth: block.blockSize > 1 ? 140 : 100,
                  userSelect: "none",
                  opacity: draggedBlockId === block.id ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                <div style={{ fontWeight: 600 }}>{block.curriculumName}</div>
                <div style={{ opacity: 0.8 }}>
                  第{block.sessionNumber}回
                  {block.blockSize > 1 && ` (${block.blockSize}コマ)`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error blocks area */}
      {errorBlocks.length > 0 && (
        <div
          style={{
            background: "rgba(248, 81, 73, 0.05)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <h3 style={{ fontSize: "0.9rem", marginBottom: "0.75rem", color: "var(--red)" }}>
            配置エラー
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {errorBlocks.map((block) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => handleDragStart(block.id)}
                onDragEnd={handleDragEnd}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--red)",
                  color: "var(--red)",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  cursor: "grab",
                }}
              >
                <div style={{ fontWeight: 600 }}>{block.curriculumName} 第{block.sessionNumber}回</div>
                <div style={{ fontSize: "0.65rem" }}>{block.errorMessage}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Curriculum legend */}
      {curricula.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: "0.9rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
            カリキュラム一覧 (M1データ)
          </h3>
          <table className="table">
            <thead>
              <tr>
                <th>色</th>
                <th>カリキュラム</th>
                <th>講師</th>
                <th>回数</th>
              </tr>
            </thead>
            <tbody>
              {curricula.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        background: c.color,
                      }}
                    />
                  </td>
                  <td>{c.name}</td>
                  <td>{c.instructorName}</td>
                  <td>{c.totalSessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
