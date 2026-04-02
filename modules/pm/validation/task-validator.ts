/**
 * タスク内容の検証ロジック
 */

import type { ValidationIssue, TaskValidationResult } from "../types.js";

interface TaskToValidate {
  id: string;
  title: string;
  description: string | null;
  labels: string[];
  estimatedHours: number | null;
  blockedBy: string[];
  status: string;
}

/**
 * タスク内容を検証し、充実度スコアと改善提案を返す
 */
export function validateTask(task: TaskToValidate): TaskValidationResult {
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // 本文の文字数チェック
  const descLength = task.description?.length ?? 0;
  if (descLength === 0) {
    issues.push({
      type: "missing_description",
      message: "タスクの説明が未記入です",
      severity: "error",
    });
    suggestions.push("タスクの目的・ゴールを記述してください");
    score -= 30;
  } else if (descLength < 50) {
    issues.push({
      type: "short_description",
      message: "要件が不十分です（50文字未満）",
      severity: "warning",
    });
    suggestions.push("背景、手順、期待される結果を追記してください");
    score -= 15;
  }

  // 受入条件の有無
  const desc = (task.description ?? "").toLowerCase();
  const hasAcceptanceCriteria =
    desc.includes("完了条件") ||
    desc.includes("acceptance criteria") ||
    desc.includes("done when") ||
    desc.includes("ac:") ||
    desc.includes("## 完了") ||
    desc.includes("## done");

  if (!hasAcceptanceCriteria && descLength > 0) {
    issues.push({
      type: "missing_acceptance_criteria",
      message: "受入条件（完了条件）が記載されていません",
      severity: "warning",
    });
    suggestions.push("「完了条件」セクションを追加してください");
    score -= 10;
  }

  // 見積もりの有無
  if (task.estimatedHours === null || task.estimatedHours === 0) {
    const hasEstimateLabel = task.labels.some(
      (l) => l.startsWith("size/") || l.startsWith("estimate/") || l.match(/^\d+h$/)
    );
    if (!hasEstimateLabel) {
      issues.push({
        type: "missing_estimate",
        message: "見積もり工数が設定されていません",
        severity: "info",
      });
      suggestions.push("見積もり工数またはサイズラベルを付与してください");
      score -= 10;
    }
  }

  // 依存関係の確認
  if (task.blockedBy.length === 0 && descLength > 100) {
    // 本文が長いのにブロッカーがない場合
    const mentionsBlocking =
      desc.includes("depends on") ||
      desc.includes("blocked by") ||
      desc.includes("依存") ||
      desc.includes("ブロック");

    if (mentionsBlocking) {
      issues.push({
        type: "unlinked_dependency",
        message: "依存関係が本文に記載されていますが、blockedBy が未設定です",
        severity: "warning",
      });
      suggestions.push("依存タスクを blockedBy フィールドにリンクしてください");
      score -= 5;
    }
  }

  // タイトルの品質チェック
  if (task.title.length < 5) {
    issues.push({
      type: "short_title",
      message: "タイトルが短すぎます",
      severity: "warning",
    });
    suggestions.push("具体的で分かりやすいタイトルに変更してください");
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    taskId: task.id,
    validatedAt: new Date().toISOString(),
    score,
    issues,
    suggestions,
  };
}
