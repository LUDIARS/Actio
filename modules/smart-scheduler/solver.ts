/**
 * DP-based auto-placement solver
 *
 * グループメンバーの空き状況を元に、配置したい予定群を
 * 最適なスロットに自動配置する。
 *
 * アルゴリズム:
 * - タスクを優先度順にソートし、バックトラッキング＋メモ化DPで
 *   全タスクのスコア合計が最大になる配置を探索する
 * - 各スロットのスコア = 空きメンバー数 × 10 + 希望曜日ボーナス + 希望コマボーナス
 */

import { DAYS_COUNT, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { AvailabilitySlot } from "../../src/shared/types.js";

// ─── Types ──────────────────────────────────────────────────

export interface TaskInput {
  id: string;
  title: string;
  duration: number;        // コマ数 (1-based)
  priority: number;
  preferredDays: number[]; // 空=制約なし
  preferredPeriods: number[]; // 空=制約なし
}

export interface Placement {
  taskId: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  score: number;
}

export interface SolveResult {
  placements: Placement[];
  totalScore: number;
  unplacedTaskIds: string[];
}

// ─── Solver ─────────────────────────────────────────────────

/**
 * スロットのスコアを計算
 */
function slotScore(
  day: number,
  period: number,
  duration: number,
  availabilityMap: Map<string, AvailabilitySlot>,
  task: TaskInput,
  totalMembers: number
): number {
  let score = 0;

  // 全コマが空いているか確認 & スコア計算
  for (let p = period; p < period + duration; p++) {
    if (p >= PERIODS_COUNT) return -1; // はみ出し
    const slot = availabilityMap.get(`${day}-${p}`);
    if (!slot) return -1; // 空きなし

    // 空きメンバー数に応じたスコア
    score += slot.availableCount * 10;

    // 全員空きボーナス
    if (slot.isFullyAvailable) score += 5;
  }

  // 希望曜日ボーナス
  if (task.preferredDays.length > 0 && task.preferredDays.includes(day)) {
    score += 20;
  }

  // 希望コマボーナス
  if (task.preferredPeriods.length > 0 && task.preferredPeriods.includes(period)) {
    score += 15;
  }

  // 優先度ボーナス
  score += task.priority * 5;

  // 週末ペナルティ
  if (day >= 5) score -= 5;

  return score;
}

/**
 * 配置済みスロットとの衝突チェック
 */
function conflicts(
  day: number,
  period: number,
  duration: number,
  occupied: Set<string>
): boolean {
  for (let p = period; p < period + duration; p++) {
    if (occupied.has(`${day}-${p}`)) return true;
  }
  return false;
}

/**
 * 配置を記録
 */
function markOccupied(day: number, period: number, duration: number, occupied: Set<string>) {
  for (let p = period; p < period + duration; p++) {
    occupied.add(`${day}-${p}`);
  }
}

function unmarkOccupied(day: number, period: number, duration: number, occupied: Set<string>) {
  for (let p = period; p < period + duration; p++) {
    occupied.delete(`${day}-${p}`);
  }
}

/**
 * DPバックトラッキングで最適配置を探索
 *
 * tasks は priority 降順でソート済みとする
 * memo[bitmask] = そのマスクから先の最大スコア
 */
export function solve(
  tasks: TaskInput[],
  availability: AvailabilitySlot[],
  totalMembers: number
): SolveResult {
  const n = tasks.length;

  // タスクが多すぎる場合はグリーディに切り替え
  if (n > 20) {
    return solveGreedy(tasks, availability, totalMembers);
  }

  // 空きスロットをMapに
  const availMap = new Map<string, AvailabilitySlot>();
  for (const slot of availability) {
    availMap.set(`${slot.day}-${slot.period}`, slot);
  }

  // 各タスクの候補スロットを事前計算 (day, period, score)
  const candidates: Array<Array<{ day: number; period: number; score: number }>> = [];
  for (const task of tasks) {
    const taskCandidates: Array<{ day: number; period: number; score: number }> = [];
    for (let day = 0; day < DAYS_COUNT; day++) {
      // 希望曜日フィルタ
      if (task.preferredDays.length > 0 && !task.preferredDays.includes(day)) continue;

      for (let period = 0; period <= PERIODS_COUNT - task.duration; period++) {
        const s = slotScore(day, period, task.duration, availMap, task, totalMembers);
        if (s > 0) {
          taskCandidates.push({ day, period, score: s });
        }
      }
    }
    // スコア降順
    taskCandidates.sort((a, b) => b.score - a.score);
    candidates.push(taskCandidates);
  }

  // DP with bitmask (n <= 20)
  const memo = new Map<string, { score: number; placements: Placement[] }>();
  const occupied = new Set<string>();

  function dp(mask: number): { score: number; placements: Placement[] } {
    // 全タスク処理済み
    if (mask === (1 << n) - 1) {
      return { score: 0, placements: [] };
    }

    // occupiedの状態込みでメモ化キーを生成
    const key = `${mask}`;
    // 注意: occupiedはmaskから復元可能ではないので、
    // 順序固定のため次の未配置タスクのみを選ぶ
    // → タスクは優先度順に配置する (順序固定DP)

    // 次の未配置タスクを見つける
    let taskIdx = -1;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) {
        taskIdx = i;
        break;
      }
    }
    if (taskIdx === -1) return { score: 0, placements: [] };

    const task = tasks[taskIdx];
    const taskCands = candidates[taskIdx];

    // このタスクをスキップするケース
    let best = dp(mask | (1 << taskIdx));

    // 各候補を試す
    for (const cand of taskCands) {
      if (conflicts(cand.day, cand.period, task.duration, occupied)) continue;

      markOccupied(cand.day, cand.period, task.duration, occupied);
      const rest = dp(mask | (1 << taskIdx));
      const totalScore = cand.score + rest.score;

      if (totalScore > best.score) {
        best = {
          score: totalScore,
          placements: [
            {
              taskId: task.id,
              title: task.title,
              day: cand.day,
              period: cand.period,
              duration: task.duration,
              score: cand.score,
            },
            ...rest.placements,
          ],
        };
      }

      unmarkOccupied(cand.day, cand.period, task.duration, occupied);

      // 上位3候補のみ探索 (計算量制限)
      if (taskCands.indexOf(cand) >= 2) break;
    }

    return best;
  }

  const result = dp(0);

  const placedIds = new Set(result.placements.map((p) => p.taskId));
  const unplacedTaskIds = tasks.filter((t) => !placedIds.has(t.id)).map((t) => t.id);

  return {
    placements: result.placements,
    totalScore: result.score,
    unplacedTaskIds,
  };
}

/**
 * タスクが多い場合のグリーディ配置
 */
function solveGreedy(
  tasks: TaskInput[],
  availability: AvailabilitySlot[],
  totalMembers: number
): SolveResult {
  const availMap = new Map<string, AvailabilitySlot>();
  for (const slot of availability) {
    availMap.set(`${slot.day}-${slot.period}`, slot);
  }

  // 優先度降順でソート
  const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
  const occupied = new Set<string>();
  const placements: Placement[] = [];
  const unplacedTaskIds: string[] = [];

  for (const task of sorted) {
    let bestSlot: { day: number; period: number; score: number } | null = null;

    for (let day = 0; day < DAYS_COUNT; day++) {
      if (task.preferredDays.length > 0 && !task.preferredDays.includes(day)) continue;

      for (let period = 0; period <= PERIODS_COUNT - task.duration; period++) {
        if (conflicts(day, period, task.duration, occupied)) continue;

        const s = slotScore(day, period, task.duration, availMap, task, totalMembers);
        if (s > 0 && (!bestSlot || s > bestSlot.score)) {
          bestSlot = { day, period, score: s };
        }
      }
    }

    if (bestSlot) {
      markOccupied(bestSlot.day, bestSlot.period, task.duration, occupied);
      placements.push({
        taskId: task.id,
        title: task.title,
        day: bestSlot.day,
        period: bestSlot.period,
        duration: task.duration,
        score: bestSlot.score,
      });
    } else {
      unplacedTaskIds.push(task.id);
    }
  }

  return {
    placements,
    totalScore: placements.reduce((sum, p) => sum + p.score, 0),
    unplacedTaskIds,
  };
}
