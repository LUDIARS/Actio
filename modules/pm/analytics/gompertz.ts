/**
 * ゴンペルツ曲線 (バグ収束予測)
 *
 * y(t) = a × exp(-b × exp(-c × t))
 * a: 推定総バグ数 (上限漸近値)
 * b: 初期遅延パラメータ
 * c: 成長速度パラメータ
 */

import type { GompertzReport, GompertzDataPoint } from "../types.js";

interface BugDataPoint {
  date: string;
  cumulativeFound: number;
  cumulativeFixed: number;
}

/**
 * ゴンペルツ関数
 */
function gompertz(t: number, a: number, b: number, c: number): number {
  return a * Math.exp(-b * Math.exp(-c * t));
}

/**
 * 3点法によるゴンペルツパラメータ推定
 *
 * データから等間隔の3点を取り、パラメータを直接計算する。
 */
function fitGompertz3Point(
  dataPoints: BugDataPoint[]
): { a: number; b: number; c: number; r2: number } | null {
  if (dataPoints.length < 3) return null;

  // 等間隔に3点を選択
  const n = dataPoints.length;
  const i1 = 0;
  const i2 = Math.floor(n / 2);
  const i3 = n - 1;

  const y1 = dataPoints[i1].cumulativeFound;
  const y2 = dataPoints[i2].cumulativeFound;
  const y3 = dataPoints[i3].cumulativeFound;

  if (y1 <= 0 || y2 <= 0 || y3 <= 0) return null;
  if (y1 >= y2 || y2 >= y3) {
    // 単調増加でない場合は最後の値で近似
    return null;
  }

  // 3点法の公式
  // a = (y1 * y3 - y2^2) / (y1 + y3 - 2 * y2)
  const denom = y1 + y3 - 2 * y2;
  if (Math.abs(denom) < 1e-10) return null;

  const a = (y1 * y3 - y2 * y2) / denom;
  if (a <= 0 || a <= y3) {
    // a はデータの最大値より大きくなるべき
    // フォールバック: 最後の値の1.5倍を上限とする
    return fitWithFixedA(dataPoints, y3 * 1.5);
  }

  const logRatio1 = Math.log(y1 / a);
  const logRatio2 = Math.log(y2 / a);

  if (logRatio1 >= 0 || logRatio2 >= 0) return null;

  const t1 = 0;
  const t2 = i2 - i1;
  const t3 = i3 - i1;

  const c = (t2 - t1) > 0 ? -Math.log(logRatio2 / logRatio1) / (t2 - t1) : 0.1;
  const b = -logRatio1 / Math.exp(-c * t1);

  if (b <= 0 || c <= 0) return null;

  // R² を計算
  const mean = dataPoints.reduce((s, d) => s + d.cumulativeFound, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = gompertz(i, a, b, c);
    ssTot += (dataPoints[i].cumulativeFound - mean) ** 2;
    ssRes += (dataPoints[i].cumulativeFound - predicted) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { a, b, c, r2: Math.max(0, Math.min(1, r2)) };
}

/**
 * 固定の a でフィッティング
 */
function fitWithFixedA(
  dataPoints: BugDataPoint[],
  a: number
): { a: number; b: number; c: number; r2: number } | null {
  const n = dataPoints.length;
  if (n < 2) return null;

  const y1 = dataPoints[0].cumulativeFound;
  const y2 = dataPoints[n - 1].cumulativeFound;

  if (y1 <= 0 || y2 <= 0 || y1 >= a || y2 >= a) return null;

  const logR1 = Math.log(y1 / a);
  const logR2 = Math.log(y2 / a);

  const c = (n - 1) > 0 ? -Math.log(logR2 / logR1) / (n - 1) : 0.1;
  const b = -logR1;

  if (b <= 0 || c <= 0) return null;

  const mean = dataPoints.reduce((s, d) => s + d.cumulativeFound, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = gompertz(i, a, b, c);
    ssTot += (dataPoints[i].cumulativeFound - mean) ** 2;
    ssRes += (dataPoints[i].cumulativeFound - predicted) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { a, b, c, r2: Math.max(0, Math.min(1, r2)) };
}

/**
 * ゴンペルツレポートを生成
 */
export function generateGompertzReport(
  projectId: string,
  bugData: BugDataPoint[]
): GompertzReport {
  const now = new Date().toISOString();

  if (bugData.length < 3) {
    return {
      projectId,
      generatedAt: now,
      totalBugsFound: bugData.length > 0 ? bugData[bugData.length - 1].cumulativeFound : 0,
      totalBugsFixed: bugData.length > 0 ? bugData[bugData.length - 1].cumulativeFixed : 0,
      estimatedTotalBugs: 0,
      convergenceDate: null,
      confidenceLevel: 0,
      dataPoints: bugData.map((d) => ({ ...d, predicted: d.cumulativeFound })),
    };
  }

  const params = fitGompertz3Point(bugData);
  const totalFound = bugData[bugData.length - 1].cumulativeFound;
  const totalFixed = bugData[bugData.length - 1].cumulativeFixed;

  if (!params) {
    return {
      projectId,
      generatedAt: now,
      totalBugsFound: totalFound,
      totalBugsFixed: totalFixed,
      estimatedTotalBugs: totalFound,
      convergenceDate: null,
      confidenceLevel: 0,
      dataPoints: bugData.map((d) => ({ ...d, predicted: d.cumulativeFound })),
    };
  }

  const { a, b, c, r2 } = params;

  // 95% 収束日を推定: y(t) = 0.95 * a → t = -ln(-ln(0.95) / b) / c
  let convergenceDate: string | null = null;
  const convergenceThreshold = 0.95 * a;
  if (c > 0 && b > 0) {
    const logVal = Math.log(convergenceThreshold / a);
    if (logVal < 0) {
      const tConverge = -Math.log(-logVal / b) / c;
      const daysSinceStart = Math.ceil(tConverge);
      if (daysSinceStart > 0 && daysSinceStart < 365 * 5) {
        const startDate = new Date(bugData[0].date);
        startDate.setDate(startDate.getDate() + daysSinceStart);
        convergenceDate = startDate.toISOString().split("T")[0];
      }
    }
  }

  // 予測値付きデータポイント
  const dataPoints: GompertzDataPoint[] = bugData.map((d, i) => ({
    ...d,
    predicted: Math.round(gompertz(i, a, b, c) * 100) / 100,
  }));

  return {
    projectId,
    generatedAt: now,
    totalBugsFound: totalFound,
    totalBugsFixed: totalFixed,
    estimatedTotalBugs: Math.ceil(a),
    convergenceDate,
    confidenceLevel: Math.round(r2 * 100) / 100,
    dataPoints,
  };
}
