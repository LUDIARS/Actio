import type { TaskPriority } from "./api-types";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "最優先",
};
