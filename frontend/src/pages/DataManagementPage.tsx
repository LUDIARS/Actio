import { useState, useCallback } from "react";
import { TimetableGrid, type GridSlot } from "../components/TimetableGrid";
import {
  DAY_LABELS,
  DAYS_COUNT,
  PERIODS_COUNT,
  CANDIDATE_COLORS,
  getPeriodLabel,
} from "../lib/constants";
import { m1 } from "../lib/api";

interface ScheduleEntry {
  day: number;
  period: number;
  curriculumId: string;
  curriculumName?: string;
  roomId: string;
  roomName?: string;
  instructorId: string;
  instructorName?: string;
  candidateCount: number;
}

interface ManualEntry {
  id?: string;
  name: string;
  instructorName: string;
  day: number;
  period: number;
  duration: number;
}

export function DataManagementPage() {
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
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"csv" | "manual">("manual");

  // 手動入力フォーム
  const [manualForm, setManualForm] = useState<ManualEntry>({
    name: "",
    instructorName: "",
    day: 0,
    period: 0,
    duration: 1,
  });
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);

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
    } catch (e: any) {
      showMessage(`Error: ${e.message}`);
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
    } catch (e: any) {
      showMessage(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  const handleFetch = async () => {
    try {
      const result = await m1.getSchedule();
      setEntries(result.entries || []);
      showMessage(`Loaded ${(result.entries || []).length} entries`);
    } catch (e: any) {
      showMessage(`Error: ${e.message}`);
    }
  };

  const handleSlotClick = (day: number, period: number) => {
    if (tab === "manual") {
      // 手動入力モードでは、クリックでフォームの曜日・時限をセット
      setManualForm((f) => ({ ...f, day, period }));
      return;
    }

    const entry = entries.find((e) => e.day === day && e.period === period);
    if (selectedSlot) {
      if (selectedSlot.day === day && selectedSlot.period === period) {
        setSelectedSlot(null);
        setSwapCandidates([]);
        return;
      }
      handleSwap(selectedSlot.day, selectedSlot.period, day, period);
      setSelectedSlot(null);
      setSwapCandidates([]);
    } else if (entry) {
      setSelectedSlot({ day, period });
      computeSwapCandidates(entry);
    }
  };

  const computeSwapCandidates = (entry: ScheduleEntry) => {
    const candidates: { day: number; period: number; candidateCount: number }[] = [];
    for (let d = 0; d < DAYS_COUNT; d++) {
      for (let p = 0; p < PERIODS_COUNT; p++) {
        if (d === entry.day && p === entry.period) continue;
        const existing = entries.find((e) => e.day === d && e.period === p);
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
    } catch (e: any) {
      showMessage(`Swap error: ${e.message}`);
    }
  };

  const handleConfirm = async () => {
    try {
      await m1.confirm();
      showMessage("スケジュールが確定されました");
    } catch (e: any) {
      showMessage(`Error: ${e.message}`);
    }
  };

  // 手動入力の追加
  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.name) {
      showMessage("Error: 科目名を入力してください");
      return;
    }
    const newEntry: ManualEntry = {
      ...manualForm,
      id: `manual-${Date.now()}`,
    };
    setManualEntries((prev) => [...prev, newEntry]);

    // CSVモードのエントリにも反映
    const schedEntry: ScheduleEntry = {
      day: manualForm.day,
      period: manualForm.period,
      curriculumId: newEntry.id!,
      curriculumName: manualForm.name,
      roomId: "",
      instructorId: "",
      instructorName: manualForm.instructorName,
      candidateCount: 0,
    };
    setEntries((prev) => [...prev, schedEntry]);
    setManualForm({ name: "", instructorName: "", day: 0, period: 0, duration: 1 });
    showMessage(`「${manualForm.name}」を追加しました`);
  };

  const handleRemoveManual = (id: string) => {
    setManualEntries((prev) => prev.filter((e) => e.id !== id));
    setEntries((prev) => prev.filter((e) => e.curriculumId !== id));
  };

  const getCandidateColor = (count: number) => {
    if (count >= 15) return CANDIDATE_COLORS.high;
    if (count >= 4) return CANDIDATE_COLORS.medium;
    return CANDIDATE_COLORS.low;
  };

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
        <h1>M1 データ管理</h1>
        <p>CSV取込・手動入力でデータを登録し、時間割を管理します</p>
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

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        {([
          { key: "manual" as const, label: "手動入力" },
          { key: "csv" as const, label: "CSV取込" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 手動入力タブ */}
      {tab === "manual" && (
        <div>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
              科目を手動で追加
            </h3>
            <form onSubmit={handleAddManual}>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="form-group" style={{ flex: 2, minWidth: 150 }}>
                  <label>科目名</label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="例: プログラミング基礎"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                  <label>講師名</label>
                  <input
                    type="text"
                    value={manualForm.instructorName}
                    onChange={(e) => setManualForm((f) => ({ ...f, instructorName: e.target.value }))}
                    placeholder="例: 田中先生"
                  />
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 80 }}>
                  <label>曜日</label>
                  <select
                    value={manualForm.day}
                    onChange={(e) => setManualForm((f) => ({ ...f, day: parseInt(e.target.value) }))}
                  >
                    {DAY_LABELS.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 100 }}>
                  <label>時限</label>
                  <select
                    value={manualForm.period}
                    onChange={(e) => setManualForm((f) => ({ ...f, period: parseInt(e.target.value) }))}
                  >
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i} value={i}>{getPeriodLabel(i)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 80 }}>
                  <label>コマ数</label>
                  <select
                    value={manualForm.duration}
                    onChange={(e) => setManualForm((f) => ({ ...f, duration: parseInt(e.target.value) }))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="primary" style={{ marginBottom: "1rem" }}>
                  追加
                </button>
              </div>
            </form>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              グリッドのセルをクリックすると、その曜日・時限が自動でフォームに入ります
            </p>
          </div>

          {/* 手動入力一覧 */}
          {manualEntries.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
                手動入力データ ({manualEntries.length}件)
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>科目名</th>
                    <th>講師</th>
                    <th>曜日</th>
                    <th>時限</th>
                    <th>コマ数</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {manualEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ fontWeight: 500 }}>{entry.name}</td>
                      <td>{entry.instructorName || "-"}</td>
                      <td>{DAY_LABELS[entry.day]}</td>
                      <td>{getPeriodLabel(entry.period)}</td>
                      <td>{entry.duration}</td>
                      <td>
                        <button
                          className="danger"
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                          onClick={() => handleRemoveManual(entry.id!)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CSV取込タブ */}
      {tab === "csv" && (
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

          {/* Toolbar */}
          <div className="toolbar" style={{ marginTop: "1rem" }}>
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
              確定
            </button>
          </div>
        </div>
      )}

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

      {selectedSlot && (
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--orange)" }}>
          入れ替え先を選択してください（{DAY_LABELS[selectedSlot.day]}
          {selectedSlot.period + 1}限）
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
