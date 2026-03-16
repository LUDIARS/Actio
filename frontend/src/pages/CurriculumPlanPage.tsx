import { useState, useCallback, useRef } from "react";
import { DAY_LABELS, PERIODS_COUNT, getPeriodLabel } from "../lib/constants";

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

// ─── Demo Data ──────────────────────────────────────────────

function generateDemoData(): { curricula: Curriculum[]; blocks: PlanBlock[] } {
  const curricula: Curriculum[] = [
    { id: "c1", name: "プログラミング基礎", departmentName: "情報工学科", instructorName: "田中先生", slotsPerSession: 2, totalSessions: 3, color: BLOCK_COLORS[0] },
    { id: "c2", name: "データベース論", departmentName: "情報工学科", instructorName: "佐藤先生", slotsPerSession: 1, totalSessions: 4, color: BLOCK_COLORS[1] },
    { id: "c3", name: "Web開発演習", departmentName: "情報工学科", instructorName: "鈴木先生", slotsPerSession: 2, totalSessions: 2, color: BLOCK_COLORS[2] },
    { id: "c4", name: "アルゴリズム入門", departmentName: "情報工学科", instructorName: "高橋先生", slotsPerSession: 1, totalSessions: 3, color: BLOCK_COLORS[3] },
    { id: "c5", name: "ネットワーク概論", departmentName: "情報工学科", instructorName: "伊藤先生", slotsPerSession: 1, totalSessions: 2, color: BLOCK_COLORS[4] },
  ];

  const blocks: PlanBlock[] = [];
  for (const c of curricula) {
    for (let i = 1; i <= c.totalSessions; i++) {
      blocks.push({
        id: `${c.id}-${i}`,
        curriculumName: c.name,
        sessionNumber: i,
        blockSize: c.slotsPerSession,
        color: c.color,
        placementStatus: "unplaced",
        day: null,
        period: null,
        errorMessage: null,
      });
    }
  }
  return { curricula, blocks };
}

// ─── Component ──────────────────────────────────────────────

export function CurriculumPlanPage() {
  const [{ curricula, blocks }, setData] = useState(generateDemoData);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [highlightSlot, setHighlightSlot] = useState<{ day: number; period: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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

  // Check if a slot is a continuation of a multi-slot block (not the first slot)
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

  // Place a block at a grid position (snap/absorb)
  const placeBlock = useCallback(
    (blockId: string, day: number, period: number) => {
      setData((prev) => {
        const newBlocks = prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          if (!canPlace(b, day, period)) {
            return { ...b, placementStatus: "error" as const, day: null, period: null, errorMessage: "配置不可: コマが重複しています" };
          }
          return { ...b, placementStatus: "placed" as const, day, period, errorMessage: null };
        });
        return { ...prev, blocks: newBlocks };
      });
    },
    [canPlace]
  );

  // Remove block from grid (back to unplaced)
  const unplaceBlock = useCallback((blockId: string) => {
    setData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === blockId
          ? { ...b, placementStatus: "unplaced" as const, day: null, period: null, errorMessage: null }
          : b
      ),
    }));
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

  return (
    <div>
      <div className="page-header">
        <h1>カリキュラムプラン</h1>
        <p>
          ブロックをドラッグして時間割に配置してください。教室は後で割り当てます。
        </p>
      </div>

      {/* Stats */}
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <span className="badge green">配置済み: {placedCount}</span>
        <span className="badge orange">未配置: {unplacedBlocks.length}</span>
        {errorBlocks.length > 0 && (
          <span className="badge red">エラー: {errorBlocks.length}</span>
        )}
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "auto" }}>
          全{blocks.length}ブロック
        </span>
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
                // This cell is part of a multi-slot block, don't render separately
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

      {/* Unplaced blocks area (puzzle pieces) */}
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
      <div className="card">
        <h3 style={{ fontSize: "0.9rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          カリキュラム一覧
        </h3>
        <table className="table">
          <thead>
            <tr>
              <th>色</th>
              <th>カリキュラム</th>
              <th>学科</th>
              <th>講師</th>
              <th>コマ数/回</th>
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
                <td>{c.departmentName}</td>
                <td>{c.instructorName}</td>
                <td>{c.slotsPerSession}</td>
                <td>{c.totalSessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
