import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { GridSlot } from "../components/TimetableGrid";
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

/**
 * 指定スロットが属するカリキュラムブロック（連続コマ）を取得する。
 * 同じ day・同じ curriculumId で連続する全エントリを返す。
 */
function findBlock(entries: PlacedEntry[], day: number, period: number): PlacedEntry[] {
  const entry = entries.find((e) => e.day === day && e.period === period);
  if (!entry) return [];
  const block = entries
    .filter((e) => e.day === day && e.curriculumId === entry.curriculumId)
    .sort((a, b) => a.period - b.period);
  // 連続性チェック: period が途切れたら除外
  const startIdx = block.findIndex((e) => e.period === period);
  if (startIdx === -1) return [entry];
  // 前方探索
  let lo = startIdx;
  while (lo > 0 && block[lo - 1].period === block[lo].period - 1) lo--;
  // 後方探索
  let hi = startIdx;
  while (hi < block.length - 1 && block[hi + 1].period === block[hi].period + 1) hi++;
  return block.slice(lo, hi + 1);
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

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [tab, setTab] = useState<"list" | "swap" | "auto" | "decide">("list");

  // ターム管理
  interface Term { id: string; name: string; startDate: string; endDate: string; }
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState("");
  const [saving, setSaving] = useState(false);

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

  // D&D state
  const [draggingCurriculum, setDraggingCurriculum] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ day: number; period: number } | null>(null);

  const showMessage = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const fetchMasterData = useCallback(async () => {
    try {
      const [deptData, instData, currData, termData] = await Promise.all([
        m1Schema.getDepartments(),
        m1Schema.getInstructors(),
        m1Schema.getCurricula(),
        m1Schema.getTerms(),
      ]);
      const depts = deptData.departments || [];
      const insts = instData.instructors || [];
      const currs = currData.curricula || [];
      const loadedTerms = termData.terms || [];
      setDepartments(depts);
      setInstructors(insts);
      setCurricula(currs);
      setTerms(loadedTerms);

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
    } catch (e: unknown) {
      showMessage(`データ取得エラー: ${(e as Error).message}`, "error");
    }
  }, []);

  useEffect(() => { fetchMasterData(); }, [fetchMasterData]);

  // ターム選択時に配置データをロード
  const loadPlacementsFromDb = useCallback(async (termId: string) => {
    if (!termId) { setEntries([]); return; }
    try {
      const data = await m1Schema.getPlacements(termId);
      const placements = data.placements || [];
      const newEntries: PlacedEntry[] = [];
      for (const p of placements) {
        const cur = curricula.find((c) => c.id === p.curriculumId);
        if (!cur) continue;
        const deptIds = (cur.departmentIds && cur.departmentIds.length > 0) ? cur.departmentIds : [cur.departmentId];
        const deptNames = deptIds.map((id: string) => departments.find((d) => d.id === id)?.name || "-").join(", ");
        const instName = cur.instructorId ? (instructors.find((i) => i.id === cur.instructorId)?.name || "-") : "未アサイン";
        newEntries.push({
          day: p.day,
          period: p.period,
          curriculumId: p.curriculumId,
          curriculumName: cur.name,
          instructorId: cur.instructorId || "",
          instructorName: instName,
          departmentIds: deptIds,
          departmentNames: deptNames,
          periods: cur.periods || 1,
        });
      }
      setEntries(newEntries);
      setConfirmed(false);
    } catch (e: unknown) {
      showMessage(`配置データ取得エラー: ${(e as Error).message}`, "error");
    }
  }, [curricula, departments, instructors]);

  useEffect(() => {
    if (selectedTermId && curricula.length > 0) {
      loadPlacementsFromDb(selectedTermId);
    }
  }, [selectedTermId, loadPlacementsFromDb, curricula.length]);

  // 配置データをDBに保存
  const savePlacementsToDb = async () => {
    if (!selectedTermId) { showMessage("タームを選択してください", "error"); return; }
    setSaving(true);
    try {
      const placements = entries.map((e) => ({
        curriculumId: e.curriculumId,
        day: e.day,
        period: e.period,
      }));
      const result = await m1Schema.savePlacements(selectedTermId, placements);
      showMessage(result.message);
    } catch (e: unknown) {
      showMessage(`保存エラー: ${(e as Error).message}`, "error");
    }
    setSaving(false);
  };

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || "-";
  const getInstName = (id: string | null) => {
    if (!id) return "未アサイン";
    return instructors.find((i) => i.id === id)?.name || "-";
  };

  const handleRemoveEntry = (curriculumId: string) => {
    const entry = entries.find((e) => e.curriculumId === curriculumId);
    setEntries((prev) => prev.filter((e) => e.curriculumId !== curriculumId));
    if (entry) showMessage(`「${entry.curriculumName}」を削除しました`);
  };

  // ─── スワップ対象の判定 ──────────────────────────────────
  // 選択コマの入れ替え可能先を算出し、候補数に基づく色を返す
  // ブロック（連続コマ）単位で移動先を計算する
  const getSwapTargets = useCallback((): Map<string, string> => {
    if (!selectedSlot) return new Map();
    const fromBlock = findBlock(entries, selectedSlot.day, selectedSlot.period);
    if (fromBlock.length === 0) return new Map();

    const fromCur = curricula.find((c) => c.id === fromBlock[0].curriculumId);
    if (!fromCur) return new Map();

    const blockSize = fromBlock.length;
    const blockStartPeriod = fromBlock[0].period;

    // 講師の候補数が15以上の場合は再計算しない
    const instrId = fromCur.instructorId;
    if (instrId) {
      const availSlots = instructorAvail.get(instrId);
      if (availSlots && availSlots.size >= 15) return new Map();
    }

    // ブロック全体のエントリを除外した配列
    const withoutFrom = entries.filter((e) => !fromBlock.some((b) => b.day === e.day && b.period === e.period));

    const targets = new Map<string, string>();
    for (let d = 0; d < DAYS_COUNT; d++) {
      for (let p = 0; p <= PERIODS_COUNT - blockSize; p++) {
        // 自分自身のブロック位置ならスキップ
        if (d === selectedSlot.day && p === blockStartPeriod) continue;

        // 移動先の blockSize スロットを確認
        const targetSlotEntries: (PlacedEntry | undefined)[] = [];
        for (let offset = 0; offset < blockSize; offset++) {
          const existing = withoutFrom.find((e) => e.day === d && e.period === p + offset);
          targetSlotEntries.push(existing);
        }

        // 移動先が全て空なら単純移動
        const allEmpty = targetSlotEntries.every((e) => !e);
        if (allEmpty) {
          const err = canPlace(withoutFrom, fromCur, d, p, departments, instructorAvail);
          if (!err) targets.set(`${d}-${p}`, "");
          continue;
        }

        // 移動先が全て同一カリキュラムのブロックなら双方向スワップ
        const occupiedEntries = targetSlotEntries.filter((e) => e != null);
        if (occupiedEntries.length > 0) {
          const targetCurId = occupiedEntries[0].curriculumId;
          const targetBlock = findBlock(withoutFrom, d, p);
          // スワップ可能条件: 移動先ブロックも同じサイズ (or 全スロットが同じカリキュラムで埋まっている)
          if (targetBlock.length === blockSize && targetBlock[0].period === p &&
              targetBlock.every((e) => e.curriculumId === targetCurId)) {
            const toCur = curricula.find((c) => c.id === targetCurId);
            if (toCur) {
              const withoutBoth = withoutFrom.filter((e) => !targetBlock.some((b) => b.day === e.day && b.period === e.period));
              const errFrom = canPlace(withoutBoth, fromCur, d, p, departments, instructorAvail);
              const errTo = canPlace(withoutBoth, toCur, selectedSlot.day, blockStartPeriod, departments, instructorAvail);
              if (!errFrom && !errTo) targets.set(`${d}-${p}`, "");
            }
          }
        }
      }
    }

    // 候補数に応じた色: <=3=灰, >=7=オレンジ, >=15=緑
    const count = targets.size;
    let color = "#6E7681"; // 灰色 (3以下)
    if (count >= 15) color = "#3FB950"; // 緑
    else if (count >= 7) color = "#D29922"; // オレンジ

    const colored = new Map<string, string>();
    for (const key of targets.keys()) {
      colored.set(key, color);
    }
    return colored;
  }, [selectedSlot, entries, curricula, departments, instructorAvail]);

  // ─── D&D ドロップ先の有効スロットを計算 (ブロック単位) ──
  const dragTargets = useMemo((): Map<string, string> => {
    if (!draggingCurriculum) return new Map();
    const cur = curricula.find((c) => c.id === draggingCurriculum);
    if (!cur) return new Map();

    const blockSize = cur.periods || 1;
    const fromEntries = entries.filter((e) => e.curriculumId === draggingCurriculum);
    const isPlaced = fromEntries.length > 0;
    const withoutFrom = entries.filter((e) => e.curriculumId !== draggingCurriculum);
    const fromStartPeriod = isPlaced ? Math.min(...fromEntries.map((e) => e.period)) : -1;
    const fromDay = isPlaced ? fromEntries[0].day : -1;
    const targets = new Map<string, string>();

    for (let d = 0; d < DAYS_COUNT; d++) {
      for (let p = 0; p <= PERIODS_COUNT - blockSize; p++) {
        if (isPlaced && d === fromDay && p === fromStartPeriod) continue;

        // 移動先の blockSize スロットを確認
        const allEmpty = Array.from({ length: blockSize }, (_, offset) =>
          !withoutFrom.find((e) => e.day === d && e.period === p + offset)
        ).every(Boolean);

        if (allEmpty) {
          const err = canPlace(withoutFrom, cur, d, p, departments, instructorAvail);
          if (!err) targets.set(`${d}-${p}`, "");
        } else if (isPlaced) {
          // ブロック同士のスワップ: 移動先が同サイズブロックか確認
          const targetBlock = findBlock(withoutFrom, d, p);
          if (targetBlock.length === blockSize && targetBlock[0].period === p) {
            const toCur = curricula.find((c) => c.id === targetBlock[0].curriculumId);
            if (toCur && toCur.id !== draggingCurriculum) {
              const withoutBoth = withoutFrom.filter((e) => !targetBlock.some((b) => b.day === e.day && b.period === e.period));
              const errFrom = canPlace(withoutBoth, cur, d, p, departments, instructorAvail);
              const errTo = canPlace(withoutBoth, toCur, fromDay, fromStartPeriod, departments, instructorAvail);
              if (!errFrom && !errTo) targets.set(`${d}-${p}`, "");
            }
          }
        }
      }
    }

    const count = targets.size;
    let color = "#6E7681";
    if (count >= 15) color = "#3FB950";
    else if (count >= 7) color = "#D29922";
    const colored = new Map<string, string>();
    for (const key of targets.keys()) colored.set(key, color);
    return colored;
  }, [draggingCurriculum, entries, curricula, departments, instructorAvail]);

  // ─── D&D ハンドラ ──────────────────────────────────────────
  const handleDragStart = (curriculumId: string) => {
    setDraggingCurriculum(curriculumId);
  };

  const handleDragEnd = () => {
    setDraggingCurriculum(null);
    setDragOverSlot(null);
  };

  const handleSlotDrop = (day: number, period: number) => {
    if (!draggingCurriculum) return;
    const cur = curricula.find((c) => c.id === draggingCurriculum);
    if (!cur) return;

    const blockSize = cur.periods || 1;
    const fromEntries = entries.filter((e) => e.curriculumId === draggingCurriculum);
    const isPlaced = fromEntries.length > 0;

    if (isPlaced) {
      const fromStartPeriod = Math.min(...fromEntries.map((e) => e.period));
      const fromDay = fromEntries[0].day;
      if (fromDay === day && fromStartPeriod === period) return;

      const withoutFrom = entries.filter((e) => e.curriculumId !== draggingCurriculum);
      // 移動先にブロックがあるか確認
      const targetBlock = findBlock(withoutFrom, day, period);

      if (targetBlock.length === blockSize && targetBlock[0].period === period) {
        // ブロック同士の入れ替え
        const toCurId = targetBlock[0].curriculumId;
        const periodDelta = period - fromStartPeriod;
        const dayDelta = day - fromDay;
        setEntries((prev) => prev.map((e) => {
          if (e.curriculumId === draggingCurriculum) return { ...e, day: e.day + dayDelta, period: e.period + periodDelta };
          if (e.curriculumId === toCurId && targetBlock.some((b) => b.day === e.day && b.period === e.period)) {
            return { ...e, day: e.day - dayDelta, period: e.period - periodDelta };
          }
          return e;
        }));
        showMessage("ブロック入れ替えが完了しました");
      } else {
        // ブロック移動 (空きスロットへ)
        const periodDelta = period - fromStartPeriod;
        const dayDelta = day - fromDay;
        setEntries((prev) => prev.map((e) =>
          e.curriculumId === draggingCurriculum
            ? { ...e, day: e.day + dayDelta, period: e.period + periodDelta }
            : e
        ));
        showMessage("ブロック移動しました");
      }
    } else {
      // 新規配置
      const err = canPlace(entries, cur, day, period, departments, instructorAvail);
      if (err) { showMessage(err, "error"); return; }
      const newEntries = placeOne(cur, day, period, departments, instructors);
      setEntries((prev) => [...prev, ...newEntries]);
      showMessage(`「${cur.name}」を配置しました`);
    }
    setDraggingCurriculum(null);
    setDragOverSlot(null);
  };

  const handleSlotClick = (day: number, period: number) => {
    if (tab !== "swap") return;
    if (selectedSlot) {
      if (selectedSlot.day === day && selectedSlot.period === period) { setSelectedSlot(null); return; }
      const fromBlock = findBlock(entries, selectedSlot.day, selectedSlot.period);
      if (fromBlock.length > 0) {
        const blockSize = fromBlock.length;
        const fromStartPeriod = fromBlock[0].period;
        const fromDay = selectedSlot.day;
        const fromCurId = fromBlock[0].curriculumId;

        // 移動先にブロックがあるか確認 (from を除外してから)
        const withoutFrom = entries.filter((e) => !fromBlock.some((b) => b.day === e.day && b.period === e.period));
        const targetBlock = findBlock(withoutFrom, day, period);

        if (targetBlock.length === blockSize && targetBlock[0].period === period) {
          // ブロック同士の入れ替え
          const toCurId = targetBlock[0].curriculumId;
          const periodDelta = period - fromStartPeriod;
          const dayDelta = day - fromDay;
          setEntries((prev) => prev.map((e) => {
            if (e.curriculumId === fromCurId && fromBlock.some((b) => b.day === e.day && b.period === e.period)) {
              return { ...e, day: e.day + dayDelta, period: e.period + periodDelta };
            }
            if (e.curriculumId === toCurId && targetBlock.some((b) => b.day === e.day && b.period === e.period)) {
              return { ...e, day: e.day - dayDelta, period: e.period - periodDelta };
            }
            return e;
          }));
          showMessage("ブロック入れ替えが完了しました");
        } else if (targetBlock.length === 0) {
          // 空きスロットへのブロック移動
          const periodDelta = period - fromStartPeriod;
          const dayDelta = day - fromDay;
          setEntries((prev) => prev.map((e) => {
            if (e.curriculumId === fromCurId && fromBlock.some((b) => b.day === e.day && b.period === e.period)) {
              return { ...e, day: e.day + dayDelta, period: e.period + periodDelta };
            }
            return e;
          }));
          showMessage("ブロック移動しました");
        } else {
          showMessage("異なるブロックサイズ同士の入れ替えはできません", "error");
        }
      }
      setSelectedSlot(null);
    } else if (entries.find((e) => e.day === day && e.period === period)) {
      setSelectedSlot({ day, period });
    }
  };

  const placedIds = new Set(entries.map((e) => e.curriculumId));

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
    } catch (e: unknown) {
      showMessage(`確定エラー: ${(e as Error).message}`, "error");
    } finally {
      setConfirming(false);
    }
  };

  // ─── Grid ──────────────────────────────────────────────────

  const swapTargets = useMemo(
    () => tab === "swap" && !draggingCurriculum ? getSwapTargets() : new Map<string, string>(),
    [tab, getSwapTargets, draggingCurriculum]
  );

  // D&D or click-based targets
  const activeHighlights = draggingCurriculum ? dragTargets : swapTargets;

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
      const isSelected = selectedSlot?.day === entry.day && selectedSlot?.period === entry.period;
      const hlColor = activeHighlights.get(`${entry.day}-${entry.period}`);
      const isDragOver = dragOverSlot?.day === entry.day && dragOverSlot?.period === entry.period;
      grid[entry.day][entry.period] = {
        label: entry.curriculumName,
        sublabel: entry.instructorName,
        status: "class",
        color: isSelected ? "var(--accent)" : isDragOver ? "var(--accent)" : color ? `${color}33` : undefined,
        highlightColor: hlColor || undefined,
      };
    }

    // 空スロットのハイライト (D&D or click swap)
    if (tab === "swap") {
      for (const [key, hlColor] of activeHighlights) {
        const [d, p] = key.split("-").map(Number);
        if (!grid[d][p].label) {
          grid[d][p] = {
            ...grid[d][p],
            highlightColor: hlColor,
          };
        }
      }
    }

    return grid;
  }, [entries, selectedSlot, departments, activeHighlights, tab, dragOverSlot]);

  const allUnplaced = curricula.filter((c) => !placedIds.has(c.id));
  const totalUnplacedPeriods = allUnplaced.reduce((sum, c) => sum + (c.periods || 1), 0);

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

      {/* ターム選択 */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ minWidth: 250 }}>
            <label>ターム</label>
            <select value={selectedTermId} onChange={(e) => setSelectedTermId(e.target.value)}>
              <option value="">選択してください</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.startDate}~{t.endDate})</option>)}
            </select>
          </div>
          {selectedTermId && entries.length > 0 && (
            <button className="primary" onClick={savePlacementsToDb} disabled={saving} style={{ marginBottom: "1rem", fontSize: "0.8rem" }}>
              {saving ? "保存中..." : "配置を保存"}
            </button>
          )}
          {terms.length === 0 && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              <a href="/schema-management" style={{ color: "var(--accent)" }}>スキーマ管理</a>でタームを作成してください
            </span>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        {([
          { key: "list" as const, label: "一覧" },
          { key: "swap" as const, label: "配置・入れ替え" },
          { key: "auto" as const, label: "一括配置" },
          { key: "decide" as const, label: "プラン決定" },
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

      {/* 一覧タブ */}
      {tab === "list" && (
        <div>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", fontSize: "0.8rem", flexWrap: "wrap" }}>
            <span className="badge blue">学科: {departments.length}</span>
            <span className="badge green">講師: {instructors.length}</span>
            <span className="badge blue">科目: {curricula.length}</span>
            <span className="badge green">配置済: {placedIds.size}</span>
            <span className="badge red">未配置: {allUnplaced.length} ({totalUnplacedPeriods}コマ)</span>
          </div>

          {entries.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>配置済み ({placedIds.size}件)</h3>
              <table className="table">
                <thead><tr><th>科目</th><th>学科</th><th>講師</th><th>曜日</th><th>時限</th><th>コマ</th></tr></thead>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 配置・入れ替えタブ */}
      {tab === "swap" && (
        <div>
          {selectedSlot && (
            <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "var(--orange)" }}>
              入れ替え先を選択してください（{DAY_LABELS[selectedSlot.day]} {selectedSlot.period + 1}限）
              {swapTargets.size > 0 && (
                <span style={{ marginLeft: "0.5rem" }}>
                  — 候補 {swapTargets.size}箇所
                  {swapTargets.size <= 3 && <span style={{ color: "#6E7681" }}> (少)</span>}
                  {swapTargets.size >= 7 && swapTargets.size < 15 && <span style={{ color: "#D29922" }}> (中)</span>}
                  {swapTargets.size >= 15 && <span style={{ color: "#3FB950" }}> (多)</span>}
                </span>
              )}
            </div>
          )}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              科目カードをドラッグしてグリッドに配置できます。配置済みの科目同士はドラッグで入れ替え可能です。
              候補色: <span style={{ color: "#6E7681" }}>灰色(3以下)</span> / <span style={{ color: "#D29922" }}>オレンジ(7以上)</span> / <span style={{ color: "#3FB950" }}>緑(15以上)</span>
            </p>
          </div>
        </div>
      )}

      {/* 一括配置タブ */}
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

      {/* プラン決定タブ */}
      {tab === "decide" && (
        <div>
          {/* カリキュラム決定 */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>カリキュラム決定</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              選択中のタームの配置データをプランに変換します。「カリキュラム&#123;ターム名&#125;」のラベルでプランを作成します。
              再実行すると同じラベルのプランを削除してから再作成します。各学科ごとにプランが作成されます。
            </p>
            <button
              className="primary"
              onClick={async () => {
                if (!selectedTermId) { showMessage("タームを選択してください", "error"); return; }
                if (entries.length === 0) { showMessage("配置データがありません", "error"); return; }
                // まず配置を保存
                await savePlacementsToDb();
                setConfirming(true);
                try {
                  const result = await m1Schema.decideTerm(selectedTermId);
                  showMessage(result.message);
                } catch (e: unknown) {
                  showMessage(`決定エラー: ${(e as Error).message}`, "error");
                }
                setConfirming(false);
              }}
              disabled={!selectedTermId || entries.length === 0 || confirming}
            >
              {confirming ? "処理中..." : `カリキュラム決定 (${placedIds.size}件)`}
            </button>
          </div>

          {/* 配置確定 (グループスケジュール登録) */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>グループスケジュール登録</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              配置をグループスケジュールとして登録します。学科名と同じグループが自動作成されます。
              ラベルを指定すると、同じラベルの既存データを削除してから登録します。
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

          {/* エクスポート / インポート */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>エクスポート / インポート</h3>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                onClick={async () => {
                  try {
                    const data = await m1Schema.exportData();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `curriculum-export-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showMessage("エクスポートしました");
                  } catch (e: unknown) {
                    showMessage(`エクスポートエラー: ${(e as Error).message}`, "error");
                  }
                }}
                style={{ fontSize: "0.8rem" }}
              >
                エクスポート (JSON)
              </button>
              <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", fontSize: "0.8rem", padding: "0.4rem 0.8rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                インポート (JSON)
                <input
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text);
                      const result = await m1Schema.importData(data);
                      showMessage(result.message);
                      fetchMasterData();
                    } catch (err: unknown) {
                      showMessage(`インポートエラー: ${(err as Error).message}`, "error");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          {/* DB管理 */}
          <GroupScheduleManager showMessage={showMessage} />
        </div>
      )}

      {/* Timetable Grid with D&D */}
      {tab !== "decide" && (
        <div className="grid-7x11">
          {/* Header row */}
          <div className="header-cell" />
          {DAY_LABELS.map((label) => (
            <div key={label} className="header-cell">{label}</div>
          ))}

          {/* Period rows */}
          {Array.from({ length: PERIODS_COUNT }, (_, period) => (
            <>
              <div key={`p-${period}`} className="period-label">{getPeriodLabel(period)}</div>
              {Array.from({ length: DAYS_COUNT }, (_, day) => {
                const slot = buildSlots()[day]?.[period] || {};
                const isDropTarget = tab === "swap" && draggingCurriculum && activeHighlights.has(`${day}-${period}`);
                const className = ["slot-cell", slot.status || "free", slot.highlight ? "highlight" : ""].filter(Boolean).join(" ");

                return (
                  <div
                    key={`${day}-${period}`}
                    className={className}
                    style={{
                      ...(slot.color ? { background: slot.color } : {}),
                      ...(slot.highlightColor ? { boxShadow: `inset 0 0 0 2px ${slot.highlightColor}` } : {}),
                      cursor: tab === "swap" ? (slot.label ? "grab" : "default") : "pointer",
                    }}
                    draggable={tab === "swap" && !!slot.label}
                    onDragStart={(e) => {
                      if (tab !== "swap" || !slot.label) return;
                      const entry = entries.find((en) => en.day === day && en.period === period);
                      if (entry) {
                        e.dataTransfer.setData("text/plain", entry.curriculumId);
                        handleDragStart(entry.curriculumId);
                      }
                    }}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => {
                      if (tab === "swap" && draggingCurriculum && (isDropTarget || activeHighlights.has(`${day}-${period}`))) {
                        e.preventDefault();
                        setDragOverSlot({ day, period });
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverSlot?.day === day && dragOverSlot?.period === period) {
                        setDragOverSlot(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleSlotDrop(day, period);
                    }}
                    onClick={() => {
                      handleSlotClick(day, period);
                    }}
                  >
                    {slot.label || ""}
                    {slot.sublabel && (
                      <div style={{ fontSize: "0.6rem", opacity: 0.7, marginTop: 1 }}>{slot.sublabel}</div>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      )}

      {/* 未配置カリキュラム (配置・入れ替えタブ) */}
      {tab === "swap" && allUnplaced.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
            未配置カリキュラム ({allUnplaced.length}件 / {totalUnplacedPeriods}コマ)
          </h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {allUnplaced.map((c) => {
              const deptNames = (c.departmentIds && c.departmentIds.length > 0)
                ? c.departmentIds.map((id) => getDeptName(id)).join(",")
                : getDeptName(c.departmentId);
              const deptColor = (() => {
                const palette = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"];
                const idx = departments.findIndex((d) => d.id === (c.departmentIds?.[0] || c.departmentId));
                return palette[idx >= 0 ? idx % palette.length : 0];
              })();
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => handleDragStart(c.id)}
                  onDragEnd={handleDragEnd}
                  style={{
                    padding: "0.4rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    background: `${deptColor}22`,
                    border: `1px solid ${deptColor}66`,
                    cursor: "grab",
                    fontSize: "0.75rem",
                    lineHeight: 1.3,
                    userSelect: "none",
                    opacity: draggingCurriculum === c.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
                    {deptNames} / {getInstName(c.instructorId)} / {c.periods || 1}コマ
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 配置済みの削除 (配置・入れ替えタブ) */}
      {tab === "swap" && entries.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--text-muted)" }}>配置済みカリキュラム</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {Array.from(new Set(entries.map((e) => e.curriculumId))).map((curId) => {
              const first = entries.find((e) => e.curriculumId === curId)!;
              return (
                <span key={curId} style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  {first.curriculumName} ({DAY_LABELS[first.day]}{first.period + 1}限)
                  <button
                    className="danger"
                    style={{ padding: "0.1rem 0.3rem", fontSize: "0.65rem" }}
                    onClick={() => handleRemoveEntry(curId)}
                  >x</button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {tab !== "decide" && (
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
    } catch (e: unknown) {
      showMessage(`取得エラー: ${(e as Error).message}`, "error");
    }
    setLoading(false);
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    try {
      await m1Schema.deleteGroupSchedule(id);
      showMessage(`「${title}」を削除しました`);
      fetchSchedules();
    } catch (e: unknown) {
      showMessage(`削除エラー: ${(e as Error).message}`, "error");
    }
  };

  const handleDeleteByLabel = async (label: string) => {
    const count = schedules.filter((s) => s.label === label).length;
    if (!confirm(`ラベル「${label}」のスケジュール${count}件を一括削除しますか？`)) return;
    try {
      const result = await m1Schema.deleteGroupSchedulesByLabel(label);
      showMessage(`ラベル「${label}」の${result.deletedCount}件を削除しました`);
      fetchSchedules();
    } catch (e: unknown) {
      showMessage(`削除エラー: ${(e as Error).message}`, "error");
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
