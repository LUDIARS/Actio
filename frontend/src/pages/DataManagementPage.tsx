import { useState, useEffect, useCallback } from "react";
import { TimetableGrid, type GridSlot } from "../components/TimetableGrid";
import {
  DAY_LABELS,
  DAYS_COUNT,
  PERIODS_COUNT,
  CANDIDATE_COLORS,
  getPeriodLabel,
} from "../lib/constants";
import { m1Schema } from "../lib/api";

interface Department {
  id: string;
  name: string;
}

interface Instructor {
  id: string;
  name: string;
}

interface Curriculum {
  id: string;
  name: string;
  departmentId: string;
  instructorId: string | null;
}

interface AvailableSlot {
  day: number;
  periods: number[];
}

interface PlacedEntry {
  day: number;
  period: number;
  curriculumId: string;
  curriculumName: string;
  instructorId: string;
  instructorName: string;
  departmentName: string;
}

export function DataManagementPage() {
  // Master data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);

  // Placement state
  const [entries, setEntries] = useState<PlacedEntry[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: number;
    period: number;
  } | null>(null);

  // Manual entry form
  const [selectedCurriculum, setSelectedCurriculum] = useState("");
  const [manualDay, setManualDay] = useState(0);
  const [manualPeriod, setManualPeriod] = useState(0);

  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [tab, setTab] = useState<"manual" | "overview">("manual");
  const [filterDept, setFilterDept] = useState("");

  const showMessage = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  // Load master data from M1 schema
  const fetchMasterData = useCallback(async () => {
    setLoading(true);
    try {
      const [deptData, instData, currData] = await Promise.all([
        m1Schema.getDepartments(),
        m1Schema.getInstructors(),
        m1Schema.getCurricula(),
      ]);
      setDepartments(deptData.departments || []);
      setInstructors(instData.instructors || []);
      setCurricula(currData.curricula || []);
    } catch (e: any) {
      showMessage(`データ取得エラー: ${e.message}`, "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || "-";
  const getInstName = (id: string | null) => {
    if (!id) return "未アサイン";
    return instructors.find((i) => i.id === id)?.name || "-";
  };

  // Place a curriculum on the timetable
  const handlePlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCurriculum) {
      showMessage("科目を選択してください", "error");
      return;
    }

    // Check for existing entry at the same slot
    const existing = entries.find(
      (ent) => ent.day === manualDay && ent.period === manualPeriod
    );
    if (existing) {
      showMessage(
        `${DAY_LABELS[manualDay]} ${manualPeriod + 1}限には「${existing.curriculumName}」が既に配置されています`,
        "error"
      );
      return;
    }

    const curriculum = curricula.find((c) => c.id === selectedCurriculum);
    if (!curriculum) return;

    const newEntry: PlacedEntry = {
      day: manualDay,
      period: manualPeriod,
      curriculumId: curriculum.id,
      curriculumName: curriculum.name,
      instructorId: curriculum.instructorId || "",
      instructorName: getInstName(curriculum.instructorId),
      departmentName: getDeptName(curriculum.departmentId),
    };

    setEntries((prev) => [...prev, newEntry]);
    showMessage(`「${curriculum.name}」を ${DAY_LABELS[manualDay]} ${manualPeriod + 1}限に配置しました`);
  };

  const handleRemoveEntry = (day: number, period: number) => {
    const entry = entries.find((e) => e.day === day && e.period === period);
    setEntries((prev) => prev.filter((e) => !(e.day === day && e.period === period)));
    if (entry) {
      showMessage(`「${entry.curriculumName}」を ${DAY_LABELS[day]} ${period + 1}限から削除しました`);
    }
  };

  const handleSlotClick = (day: number, period: number) => {
    if (tab === "manual") {
      setManualDay(day);
      setManualPeriod(period);
      return;
    }

    const entry = entries.find((e) => e.day === day && e.period === period);
    if (selectedSlot) {
      // Swap mode
      if (selectedSlot.day === day && selectedSlot.period === period) {
        setSelectedSlot(null);
        return;
      }
      // Perform swap
      const fromEntry = entries.find(
        (e) => e.day === selectedSlot.day && e.period === selectedSlot.period
      );
      if (fromEntry) {
        setEntries((prev) =>
          prev.map((e) => {
            if (e.day === selectedSlot.day && e.period === selectedSlot.period) {
              return { ...e, day, period };
            }
            if (e.day === day && e.period === period) {
              return { ...e, day: selectedSlot.day, period: selectedSlot.period };
            }
            return e;
          })
        );
        showMessage("スワップが完了しました");
      }
      setSelectedSlot(null);
    } else if (entry) {
      setSelectedSlot({ day, period });
    }
  };

  // Filter curricula by department
  const filteredCurricula = filterDept
    ? curricula.filter((c) => c.departmentId === filterDept)
    : curricula;

  // Unplaced curricula (not yet on the timetable)
  const placedIds = new Set(entries.map((e) => e.curriculumId));
  const unplacedCurricula = filteredCurricula.filter((c) => !placedIds.has(c.id));

  const buildSlots = useCallback((): GridSlot[][] => {
    const grid: GridSlot[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array.from({ length: PERIODS_COUNT }, () => ({}))
    );

    for (const entry of entries) {
      grid[entry.day][entry.period] = {
        label: entry.curriculumName,
        sublabel: entry.instructorName,
        status: "class",
        color:
          selectedSlot?.day === entry.day &&
          selectedSlot?.period === entry.period
            ? "var(--accent)"
            : undefined,
      };
    }

    return grid;
  }, [entries, selectedSlot]);

  return (
    <div>
      <div className="page-header">
        <h1>M1 データ管理</h1>
        <p>M1スキーマのカリキュラムを時間割に配置・管理します</p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: messageType === "error" ? "var(--red)" : "var(--green)",
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
          { key: "manual" as const, label: "配置" },
          { key: "overview" as const, label: "一覧・スワップ" },
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

      {/* 配置タブ */}
      {tab === "manual" && (
        <div>
          {/* Master data stats */}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", fontSize: "0.8rem" }}>
            <span className="badge blue">学科: {departments.length}</span>
            <span className="badge green">講師: {instructors.length}</span>
            <span className="badge blue">科目: {curricula.length}</span>
            <span className="badge green">配置済: {entries.length}</span>
            <span className="badge red">未配置: {curricula.length - entries.length}</span>
          </div>

          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
              科目をグリッドに配置
            </h3>
            <form onSubmit={handlePlace}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                  <label>学科フィルタ</label>
                  <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                    <option value="">全学科</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                  <label>科目 (未配置: {unplacedCurricula.length}件)</label>
                  <select
                    value={selectedCurriculum}
                    onChange={(e) => setSelectedCurriculum(e.target.value)}
                    required
                  >
                    <option value="">選択してください</option>
                    {unplacedCurricula.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({getDeptName(c.departmentId)}) - {getInstName(c.instructorId)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 80 }}>
                  <label>曜日</label>
                  <select
                    value={manualDay}
                    onChange={(e) => setManualDay(parseInt(e.target.value))}
                  >
                    {DAY_LABELS.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 100 }}>
                  <label>時限</label>
                  <select
                    value={manualPeriod}
                    onChange={(e) => setManualPeriod(parseInt(e.target.value))}
                  >
                    {Array.from({ length: PERIODS_COUNT }, (_, i) => (
                      <option key={i} value={i}>{getPeriodLabel(i)}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="primary" style={{ marginBottom: "1rem" }}>
                  配置
                </button>
              </div>
            </form>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              グリッドのセルをクリックすると曜日・時限が自動設定されます
            </p>
          </div>

          {/* Placed entries list */}
          {entries.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
                配置済み ({entries.length}件)
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>科目</th>
                    <th>学科</th>
                    <th>講師</th>
                    <th>曜日</th>
                    <th>時限</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{entry.curriculumName}</td>
                      <td style={{ fontSize: "0.8rem" }}>{entry.departmentName}</td>
                      <td style={{ fontSize: "0.8rem" }}>{entry.instructorName}</td>
                      <td>{DAY_LABELS[entry.day]}</td>
                      <td>{getPeriodLabel(entry.period)}</td>
                      <td>
                        <button
                          className="danger"
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                          onClick={() => handleRemoveEntry(entry.day, entry.period)}
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

      {/* 一覧・スワップタブ */}
      {tab === "overview" && (
        <div>
          {selectedSlot && (
            <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--orange)" }}>
              入れ替え先を選択してください（{DAY_LABELS[selectedSlot.day]} {selectedSlot.period + 1}限）
            </div>
          )}

          {entries.length === 0 && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                まだ配置されていません。「配置」タブから科目をグリッドに配置してください。
              </p>
            </div>
          )}
        </div>
      )}

      {/* Timetable Grid */}
      <TimetableGrid slots={buildSlots()} onSlotClick={handleSlotClick} />

      {/* Schema link */}
      <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        マスタデータの追加・編集は
        <a href="/schema-management" style={{ color: "var(--accent)", marginLeft: "0.25rem" }}>
          スキーマ管理
        </a>
        ページで行えます
      </div>
    </div>
  );
}
