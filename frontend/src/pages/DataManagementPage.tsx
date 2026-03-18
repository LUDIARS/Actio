import { useState, useEffect, useCallback, useRef } from "react";
import { TimetableGrid, type GridSlot } from "../components/TimetableGrid";
import {
  DAY_LABELS,
  DAYS_COUNT,
  PERIODS_COUNT,
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
  periods: number;
  departmentIds?: string[];
}

interface PlacedEntry {
  day: number;
  period: number;
  curriculumId: string;
  curriculumName: string;
  instructorId: string;
  instructorName: string;
  departmentIds: string[];
  departmentNames: string;
  periods: number;
}

// 講師の出講可能スロット: instructorId -> Set<"day-period">
type InstructorAvailMap = Map<string, Set<string>>;

// 配置戦略
type PlacementStrategy = "spread" | "compact";

// ─── 配置ロジック (コマ数・全学科空き・講師出講可能スロット考慮) ──

function canPlace(
  entries: PlacedEntry[],
  curriculum: Curriculum,
  day: number,
  startPeriod: number,
  departments: Department[],
  instructorAvail: InstructorAvailMap,
): string | null {
  const periods = curriculum.periods || 1;
  const deptIds = (curriculum.departmentIds && curriculum.departmentIds.length > 0)
    ? curriculum.departmentIds
    : [curriculum.departmentId];

  if (startPeriod + periods > PERIODS_COUNT) {
    return `${periods}コマの連続配置が時間割の範囲外です`;
  }

  if (curriculum.instructorId) {
    const availSlots = instructorAvail.get(curriculum.instructorId);
    if (availSlots && availSlots.size > 0) {
      for (let p = 0; p < periods; p++) {
        const period = startPeriod + p;
        const key = `${day}-${period}`;
        if (!availSlots.has(key)) {
          return `${DAY_LABELS[day]} ${period + 1}限: 講師の出講不可スロットです`;
        }
      }
    }
  }

  for (let p = 0; p < periods; p++) {
    const period = startPeriod + p;
    for (const deptId of deptIds) {
      const conflict = entries.find(
        (e) => e.day === day && e.period === period && e.departmentIds.includes(deptId)
      );
      if (conflict) {
        const deptName = departments.find((d) => d.id === deptId)?.name || deptId;
        return `${DAY_LABELS[day]} ${period + 1}限: 学科「${deptName}」は「${conflict.curriculumName}」で使用中`;
      }
    }
    if (curriculum.instructorId) {
      const instConflict = entries.find(
        (e) => e.day === day && e.period === period && e.instructorId === curriculum.instructorId
      );
      if (instConflict) {
        return `${DAY_LABELS[day]} ${period + 1}限: 講師が「${instConflict.curriculumName}」と重複`;
      }
    }
  }

  return null;
}

function placeOne(
  curriculum: Curriculum,
  day: number,
  startPeriod: number,
  departments: Department[],
  instructors: Instructor[],
): PlacedEntry[] {
  const periods = curriculum.periods || 1;
  const deptIds = (curriculum.departmentIds && curriculum.departmentIds.length > 0)
    ? curriculum.departmentIds
    : [curriculum.departmentId];
  const deptNames = deptIds.map((id) => departments.find((d) => d.id === id)?.name || "-").join(", ");
  const instName = curriculum.instructorId
    ? (instructors.find((i) => i.id === curriculum.instructorId)?.name || "-")
    : "未アサイン";

  const result: PlacedEntry[] = [];
  for (let p = 0; p < periods; p++) {
    result.push({
      day,
      period: startPeriod + p,
      curriculumId: curriculum.id,
      curriculumName: curriculum.name,
      instructorId: curriculum.instructorId || "",
      instructorName: instName,
      departmentIds: deptIds,
      departmentNames: deptNames,
      periods,
    });
  }
  return result;
}

// ─── 自動配置エンジン ──────────────────────────────────────

interface AutoPlaceResult {
  entries: PlacedEntry[];
  placed: number;
  failed: string[];
}

/**
 * スロットの優先順序を戦略に応じて生成
 * spread: 使用日数が少ない曜日を優先 → なるべく広い曜日に分散
 * compact: 使用日数が多い曜日を優先 → なるべく少ない日数に集約
 */
function buildSlotOrder(
  strategy: PlacementStrategy,
  periodsNeeded: number,
  currentEntries: PlacedEntry[],
): [number, number][] {
  // 曜日ごとの使用コマ数
  const dayUsage: number[] = Array(DAYS_COUNT).fill(0);
  for (const e of currentEntries) {
    dayUsage[e.day]++;
  }

  // 曜日を戦略に応じてソート
  const dayOrder = Array.from({ length: DAYS_COUNT }, (_, i) => i);
  if (strategy === "spread") {
    // 使用数が少ない曜日を先に (分散)
    dayOrder.sort((a, b) => dayUsage[a] - dayUsage[b]);
  } else {
    // 使用数が多い曜日を先に (集約)
    dayOrder.sort((a, b) => {
      // 0コマの曜日は最後尾 (新しい曜日を増やさない)
      if (dayUsage[a] === 0 && dayUsage[b] > 0) return 1;
      if (dayUsage[b] === 0 && dayUsage[a] > 0) return -1;
      return dayUsage[b] - dayUsage[a];
    });
  }

  const slots: [number, number][] = [];
  for (const day of dayOrder) {
    for (let period = 0; period <= PERIODS_COUNT - periodsNeeded; period++) {
      slots.push([day, period]);
    }
  }
  return slots;
}

function tryPlaceOnce(
  curricula: Curriculum[],
  departments: Department[],
  instructors: Instructor[],
  existingEntries: PlacedEntry[],
  instructorAvail: InstructorAvailMap,
  strategy: PlacementStrategy,
): AutoPlaceResult {
  const entries = [...existingEntries];
  const placedIds = new Set(entries.map((e) => e.curriculumId));
  const unplaced = curricula.filter((c) => !placedIds.has(c.id));
  let placed = 0;
  const failed: string[] = [];

  // ランダムに順番を変える
  const shuffled = [...unplaced].sort(() => Math.random() - 0.5);

  for (const cur of shuffled) {
    const periodsNeeded = cur.periods || 1;
    const slots = buildSlotOrder(strategy, periodsNeeded, entries);

    // スロット順をシャッフル（同じ優先度内でランダム化）
    // 戦略の曜日ブロック単位でシャッフル
    const dayBlocks = new Map<number, [number, number][]>();
    for (const s of slots) {
      if (!dayBlocks.has(s[0])) dayBlocks.set(s[0], []);
      dayBlocks.get(s[0])!.push(s);
    }
    const shuffledSlots: [number, number][] = [];
    for (const [, block] of dayBlocks) {
      // ブロック内のコマ順をシャッフル
      for (let i = block.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [block[i], block[j]] = [block[j], block[i]];
      }
      shuffledSlots.push(...block);
    }

    let didPlace = false;
    for (const [day, period] of shuffledSlots) {
      const err = canPlace(entries, cur, day, period, departments, instructorAvail);
      if (!err) {
        const newEntries = placeOne(cur, day, period, departments, instructors);
        entries.push(...newEntries);
        placed++;
        didPlace = true;
        break;
      }
    }
    if (!didPlace) {
      failed.push(cur.name);
    }
  }

  return { entries, placed, failed };
}

// ─── Component ───────────────────────────────────────────────

export function DataManagementPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [instructorAvail, setInstructorAvail] = useState<InstructorAvailMap>(new Map());

  const [entries, setEntries] = useState<PlacedEntry[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ day: number; period: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [selectedCurriculum, setSelectedCurriculum] = useState("");
  const [manualDay, setManualDay] = useState(0);
  const [manualPeriod, setManualPeriod] = useState(0);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [tab, setTab] = useState<"manual" | "overview" | "auto" | "dbview">("manual");
  const [filterDept, setFilterDept] = useState("");

  // Strategy
  const [strategy, setStrategy] = useState<PlacementStrategy>("spread");

  // Retry mode
  const [retrying, setRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState(0);
  const [retryMax] = useState(10000);
  const [retryResult, setRetryResult] = useState<{
    bestEntries: PlacedEntry[];
    bestPlaced: number;
    bestFailed: string[];
    totalAttempts: number;
    success: boolean;
  } | null>(null);
  const cancelRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [termLabel, setTermLabel] = useState("");

  const [disassembleDept, setDisassembleDept] = useState("");

  const showMessage = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const fetchMasterData = useCallback(async () => {
    try {
      const [deptData, instData, currData] = await Promise.all([
        m1Schema.getDepartments(),
        m1Schema.getInstructors(),
        m1Schema.getCurricula(),
      ]);
      const depts = deptData.departments || [];
      const insts = instData.instructors || [];
      const currs = currData.curricula || [];
      setDepartments(depts);
      setInstructors(insts);
      setCurricula(currs);

      const availMap: InstructorAvailMap = new Map();
      const instructorIds = [...new Set(
        currs.map((c: Curriculum) => c.instructorId).filter((id: string | null): id is string => !!id)
      )];
      const availResults = await Promise.all(
        instructorIds.map((id) =>
          m1Schema.getAvailability(id).catch(() => ({ slots: [] }))
        )
      );
      for (let i = 0; i < instructorIds.length; i++) {
        const instrId = instructorIds[i];
        const slots = availResults[i].slots || [];
        const slotKeys = new Set<string>();
        for (const slot of slots) {
          const periods = (typeof slot.periods === "string" ? JSON.parse(slot.periods) : slot.periods) as number[];
          for (const p of periods) {
            slotKeys.add(`${slot.day}-${p}`);
          }
        }
        availMap.set(instrId, slotKeys);
      }
      setInstructorAvail(availMap);
    } catch (e: any) {
      showMessage(`データ取得エラー: ${e.message}`, "error");
    }
  }, []);

  useEffect(() => { fetchMasterData(); }, [fetchMasterData]);

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || "-";
  const getInstName = (id: string | null) => {
    if (!id) return "未アサイン";
    return instructors.find((i) => i.id === id)?.name || "-";
  };

  const handlePlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCurriculum) { showMessage("科目を選択してください", "error"); return; }
    const curriculum = curricula.find((c) => c.id === selectedCurriculum);
    if (!curriculum) return;
    const err = canPlace(entries, curriculum, manualDay, manualPeriod, departments, instructorAvail);
    if (err) { showMessage(err, "error"); return; }
    const newEntries = placeOne(curriculum, manualDay, manualPeriod, departments, instructors);
    setEntries((prev) => [...prev, ...newEntries]);
    showMessage(`「${curriculum.name}」を ${DAY_LABELS[manualDay]} ${manualPeriod + 1}限に配置しました`);
  };

  const handleRemoveEntry = (curriculumId: string) => {
    const entry = entries.find((e) => e.curriculumId === curriculumId);
    setEntries((prev) => prev.filter((e) => e.curriculumId !== curriculumId));
    if (entry) showMessage(`「${entry.curriculumName}」を削除しました`);
  };

  const handleSlotClick = (day: number, period: number) => {
    if (tab === "manual") { setManualDay(day); setManualPeriod(period); return; }
    if (tab !== "overview") return;
    if (selectedSlot) {
      if (selectedSlot.day === day && selectedSlot.period === period) { setSelectedSlot(null); return; }
      const fromEntry = entries.find((e) => e.day === selectedSlot.day && e.period === selectedSlot.period);
      if (fromEntry) {
        setEntries((prev) => prev.map((e) => {
          if (e.day === selectedSlot.day && e.period === selectedSlot.period) return { ...e, day, period };
          if (e.day === day && e.period === period) return { ...e, day: selectedSlot.day, period: selectedSlot.period };
          return e;
        }));
        showMessage("スワップが完了しました");
      }
      setSelectedSlot(null);
    } else if (entries.find((e) => e.day === day && e.period === period)) {
      setSelectedSlot({ day, period });
    }
  };

  const filteredCurricula = filterDept
    ? curricula.filter((c) => {
        const deptIds = c.departmentIds && c.departmentIds.length > 0 ? c.departmentIds : [c.departmentId];
        return deptIds.includes(filterDept);
      })
    : curricula;

  const placedIds = new Set(entries.map((e) => e.curriculumId));
  const unplacedCurricula = filteredCurricula.filter((c) => !placedIds.has(c.id));

  // ─── バラし再構築 ──────────────────────────────────────────
  const handleDisassemble = () => {
    if (!disassembleDept) { showMessage("学科を選択してください", "error"); return; }
    const removed = entries.filter((e) => e.departmentIds.includes(disassembleDept));
    const remaining = entries.filter((e) => !e.departmentIds.includes(disassembleDept));
    const removedCurrIds = new Set(removed.map((e) => e.curriculumId));
    const toReplace = curricula.filter((c) => removedCurrIds.has(c.id));
    const result = tryPlaceOnce(toReplace, departments, instructors, remaining, instructorAvail, strategy);
    setEntries(result.entries);
    if (result.failed.length === 0) {
      showMessage(`学科「${getDeptName(disassembleDept)}」を再構築しました (${toReplace.length}件)`);
    } else {
      showMessage(`再構築: ${result.placed}件配置、${result.failed.length}件失敗: ${result.failed.join(", ")}`, "error");
    }
  };

  // ─── リトライ配置 ─────────────────────────────────────────
  const handleRetryMode = async () => {
    setRetrying(true);
    setRetryProgress(0);
    setRetryResult(null);
    cancelRef.current = false;

    const fixedEntries = [...entries];
    let bestResult: AutoPlaceResult = { entries: fixedEntries, placed: 0, failed: curricula.map((c) => c.name) };
    let success = false;
    for (let i = 0; i < retryMax; i++) {
      if (cancelRef.current) break;
      const result = tryPlaceOnce(curricula, departments, instructors, fixedEntries, instructorAvail, strategy);
      if (result.placed > bestResult.placed) bestResult = result;
      if (result.failed.length === 0) {
        success = true;
        bestResult = result;
        setEntries(bestResult.entries);
        break;
      }
      if (i % 100 === 0 || i === retryMax - 1) {
        setRetryProgress(i + 1);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    setRetryProgress(retryMax);
    setRetryResult({ bestEntries: bestResult.entries, bestPlaced: bestResult.placed, bestFailed: bestResult.failed, totalAttempts: retryMax, success });
    setRetrying(false);
  };

  const applyRetryResult = () => {
    if (retryResult) {
      setEntries(retryResult.bestEntries);
      setRetryResult(null);
      showMessage(retryResult.success ? "全科目の配置に成功しました" : `最善パターン (${retryResult.bestPlaced}件配置) を適用しました`);
    }
  };

  const handleRetryAgain = () => {
    // リトライ結果を破棄してやりなおす
    setRetryResult(null);
    handleRetryMode();
  };

  // ─── 配置確定 → グループスケジュール登録 ────────────────────
  const handleConfirm = async () => {
    if (entries.length === 0) return;
    setConfirming(true);
    try {
      // カリキュラムごとにグルーピング
      const byCurriculum = new Map<string, PlacedEntry[]>();
      for (const e of entries) {
        if (!byCurriculum.has(e.curriculumId)) byCurriculum.set(e.curriculumId, []);
        byCurriculum.get(e.curriculumId)!.push(e);
      }

      const placements = Array.from(byCurriculum.entries()).map(([curId, group]) => {
        const first = group[0];
        return {
          curriculumId: curId,
          curriculumName: first.curriculumName,
          day: first.day,
          period: Math.min(...group.map((e) => e.period)),
          duration: first.periods,
          departmentNames: first.departmentIds.map((id) => departments.find((d) => d.id === id)?.name || id),
        };
      });

      const result = await m1Schema.confirmPlacements(placements, termLabel || undefined);
      setConfirmed(true);
      showMessage(result.message);
    } catch (e: any) {
      showMessage(`確定エラー: ${e.message}`, "error");
    } finally {
      setConfirming(false);
    }
  };

  // ─── Grid ──────────────────────────────────────────────────

  const buildSlots = useCallback((): GridSlot[][] => {
    const grid: GridSlot[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array.from({ length: PERIODS_COUNT }, () => ({}))
    );

    const deptColorMap = new Map<string, string>();
    const palette = [
      "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
      "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
    ];
    departments.forEach((d, i) => { deptColorMap.set(d.id, palette[i % palette.length]); });

    for (const entry of entries) {
      const primaryDept = entry.departmentIds[0];
      const color = deptColorMap.get(primaryDept) || undefined;
      grid[entry.day][entry.period] = {
        label: entry.curriculumName,
        sublabel: entry.instructorName,
        status: "class",
        color:
          selectedSlot?.day === entry.day && selectedSlot?.period === entry.period
            ? "var(--accent)"
            : color ? `${color}33` : undefined,
      };
    }

    return grid;
  }, [entries, selectedSlot, departments]);

  const totalUnplacedPeriods = unplacedCurricula.reduce((sum, c) => sum + (c.periods || 1), 0);
  const allUnplaced = curricula.filter((c) => !placedIds.has(c.id));

  return (
    <div>
      <div className="page-header">
        <h1>M1 データ管理</h1>
        <p>M1スキーマのカリキュラムを時間割に配置・管理します</p>
      </div>

      {message && (
        <div className="card" style={{ marginBottom: "1rem", borderColor: messageType === "error" ? "var(--red)" : "var(--green)", fontSize: "0.85rem" }}>
          {message}
        </div>
      )}

      {/* 確定済みバナー */}
      {confirmed && (
        <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--green)", fontSize: "0.85rem" }}>
          この配置はグループスケジュールとして登録済みです。
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        {([
          { key: "manual" as const, label: "配置" },
          { key: "overview" as const, label: "一覧・スワップ" },
          { key: "auto" as const, label: "自動配置" },
          { key: "dbview" as const, label: "DB管理" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.5rem 1rem", background: "transparent", border: "none",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", fontSize: "0.85rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 配置タブ */}
      {tab === "manual" && (
        <div>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", fontSize: "0.8rem", flexWrap: "wrap" }}>
            <span className="badge blue">学科: {departments.length}</span>
            <span className="badge green">講師: {instructors.length}</span>
            <span className="badge blue">科目: {curricula.length}</span>
            <span className="badge green">配置済: {placedIds.size}</span>
            <span className="badge red">未配置: {allUnplaced.length} ({totalUnplacedPeriods}コマ)</span>
          </div>

          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>科目をグリッドに配置</h3>
            <form onSubmit={handlePlace}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                  <label>学科フィルタ</label>
                  <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                    <option value="">全学科</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                  <label>科目 (未配置: {unplacedCurricula.length}件)</label>
                  <select value={selectedCurriculum} onChange={(e) => setSelectedCurriculum(e.target.value)} required>
                    <option value="">選択してください</option>
                    {unplacedCurricula.map((c) => {
                      const deptNames = (c.departmentIds && c.departmentIds.length > 0) ? c.departmentIds.map((id) => getDeptName(id)).join(",") : getDeptName(c.departmentId);
                      return <option key={c.id} value={c.id}>{c.name} [{deptNames}] {getInstName(c.instructorId)} ({c.periods || 1}コマ)</option>;
                    })}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 80 }}>
                  <label>曜日</label>
                  <select value={manualDay} onChange={(e) => setManualDay(parseInt(e.target.value))}>
                    {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0, minWidth: 100 }}>
                  <label>時限</label>
                  <select value={manualPeriod} onChange={(e) => setManualPeriod(parseInt(e.target.value))}>
                    {Array.from({ length: PERIODS_COUNT }, (_, i) => <option key={i} value={i}>{getPeriodLabel(i)}</option>)}
                  </select>
                </div>
                <button type="submit" className="primary" style={{ marginBottom: "1rem" }}>配置</button>
              </div>
            </form>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              グリッドのセルをクリックすると曜日・時限が自動設定されます。講師の出講可能スロット外には配置できません。
            </p>
          </div>

          {entries.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>配置済み ({placedIds.size}件)</h3>
              <table className="table">
                <thead><tr><th>科目</th><th>学科</th><th>講師</th><th>曜日</th><th>時限</th><th>コマ</th><th></th></tr></thead>
                <tbody>
                  {Array.from(new Set(entries.map((e) => e.curriculumId))).map((curId) => {
                    const group = entries.filter((e) => e.curriculumId === curId);
                    const first = group[0];
                    const periods = group.map((e) => e.period).sort((a, b) => a - b);
                    return (
                      <tr key={curId}>
                        <td style={{ fontWeight: 500 }}>{first.curriculumName}</td>
                        <td style={{ fontSize: "0.8rem" }}>{first.departmentNames}</td>
                        <td style={{ fontSize: "0.8rem" }}>{first.instructorName}</td>
                        <td>{DAY_LABELS[first.day]}</td>
                        <td>{periods.map((p) => `${p + 1}限`).join("-")}</td>
                        <td style={{ textAlign: "center" }}>{first.periods}</td>
                        <td><button className="danger" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }} onClick={() => handleRemoveEntry(curId)}>削除</button></td>
                      </tr>
                    );
                  })}
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
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>まだ配置されていません。「配置」タブから科目を配置してください。</p>
            </div>
          )}
        </div>
      )}

      {/* 自動配置タブ */}
      {tab === "auto" && (
        <div>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", fontSize: "0.8rem", flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge green">配置済: {placedIds.size}</span>
            <span className="badge red">未配置: {allUnplaced.length}</span>
          </div>

          {/* リトライ配置 */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>リトライ配置</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              ランダムな順番で最大{retryMax.toLocaleString()}回配置を試み、全科目が配置できるパターンを探索します。
              講師の出講可能スロットを考慮して配置します。
            </p>

            {/* 配置戦略 */}
            <div className="form-group" style={{ marginBottom: "0.75rem", maxWidth: 300 }}>
              <label>配置戦略</label>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as PlacementStrategy)}>
                <option value="spread">なるべく広く配置（曜日を分散）</option>
                <option value="compact">日数を限りなく少なくする（曜日を集約）</option>
              </select>
            </div>

            {retrying ? (
              <div>
                <div style={{
                  background: "var(--bg-surface-2)", borderRadius: "var(--radius-sm)",
                  overflow: "hidden", height: 24, marginBottom: "0.5rem", position: "relative",
                }}>
                  <div style={{
                    background: "var(--accent)", height: "100%",
                    width: `${(retryProgress / retryMax) * 100}%`,
                    transition: "width 0.2s", borderRadius: "var(--radius-sm)",
                  }} />
                  <span style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)", fontSize: "0.7rem", fontWeight: 600, color: "var(--text)",
                  }}>
                    {retryProgress.toLocaleString()} / {retryMax.toLocaleString()}
                  </span>
                </div>
                <button className="danger" onClick={() => { cancelRef.current = true; }} style={{ fontSize: "0.8rem" }}>中止</button>
              </div>
            ) : (
              <button className="primary" onClick={handleRetryMode} disabled={allUnplaced.length === 0}>
                リトライ配置を開始 ({allUnplaced.length}件)
              </button>
            )}

            {/* リトライ結果 */}
            {retryResult && (
              <div style={{
                marginTop: "1rem", padding: "0.75rem",
                background: retryResult.success ? "rgba(63, 185, 80, 0.1)" : "rgba(248, 81, 73, 0.1)",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${retryResult.success ? "var(--green)" : "var(--red)"}`,
              }}>
                {retryResult.success ? (
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--green)", marginBottom: "0.5rem" }}>
                    全科目の配置に成功しました
                  </p>
                ) : (
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--red)", marginBottom: "0.3rem" }}>
                      完全な配置は見つかりませんでした
                    </p>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                      最善結果: {retryResult.bestPlaced}件配置 / {retryResult.bestFailed.length}件失敗
                    </p>
                    {retryResult.bestFailed.length > 0 && (
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>配置不可: {retryResult.bestFailed.join(", ")}</p>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {!retryResult.success && (
                    <button className="primary" onClick={applyRetryResult} style={{ fontSize: "0.8rem" }}>
                      この結果を適用する
                    </button>
                  )}
                  <button onClick={handleRetryAgain} style={{ fontSize: "0.8rem" }}>
                    もう一度やりなおす
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* バラし再構築 */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>特定学科をバラして再構築</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              指定した学科に関連するカリキュラムを全て取り除き、再配置を試みます。
            </p>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group" style={{ minWidth: 150 }}>
                <label>対象学科</label>
                <select value={disassembleDept} onChange={(e) => setDisassembleDept(e.target.value)}>
                  <option value="">選択してください</option>
                  {departments.map((d) => {
                    const count = entries.filter((e) => e.departmentIds.includes(d.id)).length;
                    return <option key={d.id} value={d.id}>{d.name} ({count}コマ配置中)</option>;
                  })}
                </select>
              </div>
              <button onClick={handleDisassemble} disabled={!disassembleDept || retrying} style={{ marginBottom: "1rem" }}>
                バラして再構築
              </button>
            </div>
          </div>

          {/* 配置確定 */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>配置の確定</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              配置をグループスケジュールとして登録します。学科名と同じグループが自動作成されます。
              ラベルを指定すると、同じラベルの既存データを削除してから登録します（多重登録防止）。
            </p>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group" style={{ minWidth: 200 }}>
                <label>タームラベル（任意）</label>
                <input
                  type="text"
                  value={termLabel}
                  onChange={(e) => setTermLabel(e.target.value)}
                  placeholder="例: 2026前期"
                />
              </div>
              <button
                className="primary"
                onClick={handleConfirm}
                disabled={entries.length === 0 || confirming || confirmed}
                style={{ marginBottom: "1rem" }}
              >
                {confirming ? "登録中..." : confirmed ? "登録済み" : `配置を確定 (${placedIds.size}件)`}
              </button>
            </div>
          </div>

          {/* 全クリア */}
          <div className="card">
            <button
              className="danger"
              onClick={() => {
                if (confirm("全ての配置をクリアしますか？")) {
                  setEntries([]);
                  setConfirmed(false);
                  showMessage("全配置をクリアしました");
                }
              }}
              disabled={entries.length === 0 || retrying}
              style={{ fontSize: "0.8rem" }}
            >
              全配置をクリア
            </button>
          </div>
        </div>
      )}

      {/* DB管理タブ */}
      {tab === "dbview" && (
        <GroupScheduleManager showMessage={showMessage} />
      )}

      {/* Timetable Grid */}
      {tab !== "dbview" && <TimetableGrid slots={buildSlots()} onSlotClick={handleSlotClick} />}

      {tab !== "dbview" && (
        <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          マスタデータの追加・編集は
          <a href="/schema-management" style={{ color: "var(--accent)", marginLeft: "0.25rem" }}>スキーマ管理</a>
          ページで行えます
        </div>
      )}
    </div>
  );
}

// ─── GroupScheduleManager (DB管理タブ) ─────────────────────

interface GroupScheduleEntry {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  label: string | null;
  scheduleType: string;
  createdAt: string;
}

function GroupScheduleManager({ showMessage }: { showMessage: (msg: string, type?: "success" | "error") => void }) {
  const [schedules, setSchedules] = useState<GroupScheduleEntry[]>([]);
  const [filterLabel, setFilterLabel] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await m1Schema.getGroupSchedules();
      setSchedules(data.schedules || []);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
    setLoading(false);
  }, [showMessage]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    try {
      await m1Schema.deleteGroupSchedule(id);
      showMessage(`「${title}」を削除しました`);
      fetchSchedules();
    } catch (e: any) {
      showMessage(`削除エラー: ${e.message}`, "error");
    }
  };

  const handleDeleteByLabel = async (label: string) => {
    const count = schedules.filter((s) => s.label === label).length;
    if (!confirm(`ラベル「${label}」のスケジュール${count}件を一括削除しますか？`)) return;
    try {
      const result = await m1Schema.deleteGroupSchedulesByLabel(label);
      showMessage(`ラベル「${label}」の${result.deletedCount}件を削除しました`);
      fetchSchedules();
    } catch (e: any) {
      showMessage(`削除エラー: ${e.message}`, "error");
    }
  };

  // ラベル一覧を抽出
  const labels = [...new Set(schedules.map((s) => s.label).filter((l): l is string => !!l))].sort();
  const groupNames = [...new Set(schedules.map((s) => s.groupName))].sort();

  const filtered = schedules.filter((s) => {
    if (filterLabel && s.label !== filterLabel) return false;
    if (filterGroup && s.groupName !== filterGroup) return false;
    return true;
  });

  return (
    <div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          グループスケジュール管理 ({schedules.length}件)
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          配置確定で登録されたグループスケジュールを個別に閲覧・削除できます。
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
          <div className="form-group" style={{ minWidth: 150 }}>
            <label>ラベルフィルタ</label>
            <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}>
              <option value="">全て</option>
              {labels.map((l) => <option key={l} value={l}>{l} ({schedules.filter((s) => s.label === l).length}件)</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 150 }}>
            <label>グループフィルタ</label>
            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">全て</option>
              {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button onClick={fetchSchedules} disabled={loading} style={{ marginBottom: "1rem", fontSize: "0.8rem" }}>
            {loading ? "読込中..." : "再読込"}
          </button>
        </div>

        {/* ラベル一括削除 */}
        {labels.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <h4 style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>ラベル一括削除</h4>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {labels.map((l) => (
                <button
                  key={l}
                  className="danger"
                  style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
                  onClick={() => handleDeleteByLabel(l)}
                >
                  {l} ({schedules.filter((s) => s.label === l).length}件)
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {schedules.length === 0 ? "登録されたグループスケジュールはありません" : "フィルタ条件に一致するデータがありません"}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>グループ</th>
                <th>タイトル</th>
                <th>曜日</th>
                <th>時限</th>
                <th>コマ</th>
                <th>ラベル</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontSize: "0.8rem" }}>{s.groupName}</td>
                  <td style={{ fontWeight: 500 }}>{s.title}</td>
                  <td>{DAY_LABELS[s.day]}</td>
                  <td>{s.period + 1}限</td>
                  <td style={{ textAlign: "center" }}>{s.duration}</td>
                  <td style={{ fontSize: "0.75rem" }}>
                    {s.label ? (
                      <span className="badge blue">{s.label}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>-</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="danger"
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleDelete(s.id, s.title)}
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
  );
}
