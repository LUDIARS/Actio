import { useState, useCallback } from "react";
import { TimetableGrid, type GridSlot } from "../components/TimetableGrid";
import {
  DAY_LABELS,
  DAYS_COUNT,
  PERIODS_COUNT,
  CANDIDATE_COLORS,
} from "../lib/constants";
import { m1 } from "../lib/api";
import type { ScheduleEntry, GenerateStats } from "../lib/api-types";

export function SchedulePage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: number;
    period: number;
  } | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<
    { day: number; period: number; candidateCount: number }[]
  >([]);
  const [mode, setMode] = useState<"pack" | "spread">("pack");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<GenerateStats | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const handleImport = async (type: string, file: File) => {
    try {
      const csvText = await file.text();
      let result;
      if (type === "instructors") result = await m1.importInstructors(csvText);
      else if (type === "rooms") result = await m1.importRooms(csvText);
      else result = await m1.importCurriculum(csvText);
      showMessage(`${type} imported: ${JSON.stringify(result)}`);
    } catch (e) {
      console.error(`[SchedulePage] handleImport(${type})失敗:`, e);
      showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await m1.generate(mode);
      setEntries(result.entries || []);
      setStats(result.stats || null);
      showMessage(
        `Generated: ${result.stats?.placed || 0} placed, ${result.stats?.unplaced || 0} unplaced`
      );
    } catch (e) {
      console.error("[SchedulePage] handleGenerate失敗:", e);
      showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const handleFetch = async () => {
    try {
      const result = await m1.getSchedule();
      setEntries(result.entries || []);
      showMessage(`Loaded ${(result.entries || []).length} entries`);
    } catch (e) {
      console.error("[SchedulePage] handleFetch失敗:", e);
      showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSlotClick = (day: number, period: number) => {
    const entry = entries.find((e) => e.day === day && e.period === period);
    if (selectedSlot) {
      // Second click — execute swap
      if (selectedSlot.day === day && selectedSlot.period === period) {
        setSelectedSlot(null);
        setSwapCandidates([]);
        return;
      }
      handleSwap(selectedSlot.day, selectedSlot.period, day, period);
      setSelectedSlot(null);
      setSwapCandidates([]);
    } else if (entry) {
      // First click — select and show candidates
      setSelectedSlot({ day, period });
      computeSwapCandidates(entry);
    }
  };

  const computeSwapCandidates = (entry: ScheduleEntry) => {
    const candidates: { day: number; period: number; candidateCount: number }[] =
      [];
    for (let d = 0; d < DAYS_COUNT; d++) {
      for (let p = 0; p < PERIODS_COUNT; p++) {
        if (d === entry.day && p === entry.period) continue;
        const existing = entries.find((e) => e.day === d && e.period === p);
        // Empty slots are always candidates
        if (!existing) {
          candidates.push({ day: d, period: p, candidateCount: 10 });
        }
      }
    }
    setSwapCandidates(candidates);
  };

  const handleSwap = async (
    fromDay: number,
    fromPeriod: number,
    toDay: number,
    toPeriod: number
  ) => {
    try {
      const result = await m1.swap({ fromDay, fromPeriod, toDay, toPeriod });
      if (result.success) {
        setEntries(result.entries || entries);
        showMessage("Swap completed");
      } else {
        showMessage(`Swap failed: ${result.message}`);
      }
    } catch (e) {
      console.error("[SchedulePage] handleSwap失敗:", e);
      showMessage(`Swap error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleConfirm = async () => {
    try {
      await m1.confirm();
      showMessage("Schedule confirmed and exported to M2");
    } catch (e) {
      console.error("[SchedulePage] handleConfirm失敗:", e);
      showMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const getCandidateColor = (count: number) => {
    if (count >= 15) return CANDIDATE_COLORS.high;
    if (count >= 4) return CANDIDATE_COLORS.medium;
    return CANDIDATE_COLORS.low;
  };

  // Build grid slots
  const buildSlots = useCallback((): GridSlot[][] => {
    const grid: GridSlot[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array.from({ length: PERIODS_COUNT }, () => ({}))
    );

    for (const entry of entries) {
      grid[entry.day][entry.period] = {
        label: entry.curriculumName || entry.curriculumId.slice(0, 8),
        status: "class",
        color:
          selectedSlot?.day === entry.day &&
          selectedSlot?.period === entry.period
            ? "var(--accent)"
            : undefined,
      };
    }

    // Highlight swap candidates
    for (const c of swapCandidates) {
      if (!grid[c.day][c.period].label) {
        grid[c.day][c.period] = {
          ...grid[c.day][c.period],
          highlight: true,
          highlightColor: getCandidateColor(c.candidateCount),
        };
      }
    }

    return grid;
  }, [entries, selectedSlot, swapCandidates]);

  return (
    <div>
      <div className="page-header">
        <h1>M1 授業予定組立ツール</h1>
        <p>
          CSV取込 → DP自動配置 → コマ入れ替え → 確定
        </p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: message.startsWith("Error")
              ? "var(--red)"
              : "var(--green)",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      {/* CSV Import */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3
          style={{
            fontSize: "0.85rem",
            marginBottom: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          CSV Import
        </h3>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {(["instructors", "rooms", "curriculum"] as const).map((type) => (
            <div key={type}>
              <label style={{ textTransform: "capitalize" }}>{type}</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(type, f);
                }}
                style={{ fontSize: "0.75rem" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "pack" | "spread")}
          style={{ width: 160 }}
        >
          <option value="pack">詰め込み (Pack)</option>
          <option value="spread">分散 (Spread)</option>
        </select>
        <button className="primary" onClick={handleGenerate} disabled={loading}>
          {loading ? "生成中..." : "自動生成"}
        </button>
        <button onClick={handleFetch}>スケジュール取得</button>
        <button
          className="primary"
          onClick={handleConfirm}
          disabled={entries.length === 0}
        >
          確定 → M2へ
        </button>
        {selectedSlot && (
          <span style={{ fontSize: "0.8rem", color: "var(--orange)" }}>
            入れ替え先を選択してください（{DAY_LABELS[selectedSlot.day]}
            {selectedSlot.period + 1}限）
          </span>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "1rem",
            fontSize: "0.8rem",
          }}
        >
          <span className="badge blue">Mode: {stats.mode}</span>
          <span className="badge green">配置: {stats.placed}</span>
          {stats.unplaced > 0 && (
            <span className="badge red">未配置: {stats.unplaced}</span>
          )}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1rem",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: CANDIDATE_COLORS.low,
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          候補少 (1-3)
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: CANDIDATE_COLORS.medium,
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          候補中 (4-14)
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: CANDIDATE_COLORS.high,
              borderRadius: 2,
              marginRight: 4,
            }}
          />
          候補多 (15+)
        </span>
      </div>

      <TimetableGrid slots={buildSlots()} onSlotClick={handleSlotClick} />
    </div>
  );
}
