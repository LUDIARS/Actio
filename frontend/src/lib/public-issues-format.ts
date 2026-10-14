/** パブリックイシューの表示用の純関数 (ページから分離してテストする) */

/** 認証の外で描画する path。 RequireAuth・初回設定の確認を通さない */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/public/issues" || pathname.startsWith("/public/issues/");
}

const STATUS_LABELS: Record<string, string> = {
  open: "未着手",
  in_progress: "対応中",
  blocked: "保留",
  done: "完了",
  cancelled: "取り下げ",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "緊急",
};

const SEVERITY_LABELS: Record<string, string> = {
  s1: "致命",
  s2: "重大",
  s3: "通常",
  s4: "軽微",
};

export function statusLabel(status: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function severityLabel(severity: string | null): string {
  if (!severity) return "—";
  return SEVERITY_LABELS[severity] ?? severity;
}

export function formatPublicDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ja-JP");
}

/** URL の ?project= を読む。 形式が違えば null (サーバでも検証する) */
export function readProjectParam(search: string): string | null {
  const value = new URLSearchParams(search).get("project");
  return value && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : null;
}
