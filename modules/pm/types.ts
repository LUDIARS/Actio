/**
 * PM モジュール固有の型定義
 */

// ─── Source Config ─────────────────────────────────────────

export interface GitHubSourceConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface NotionSourceConfig {
  databaseId: string;
  token: string;
}

export type SourceConfig = GitHubSourceConfig | NotionSourceConfig;

// ─── Task Status ──────────────────────────────────────────

export const PM_TASK_STATUSES = ["open", "in_progress", "review", "closed"] as const;
export type PMTaskStatus = (typeof PM_TASK_STATUSES)[number];

export const PM_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type PMPriority = (typeof PM_PRIORITIES)[number];

export const PM_SOURCES = ["github", "notion"] as const;
export type PMSource = (typeof PM_SOURCES)[number];

// ─── Diff Detection ───────────────────────────────────────

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface TaskDiff {
  taskExternalId: string;
  changeType: "created" | "updated" | "closed" | "reopened";
  changes: FieldChange[];
}

// ─── Sync ─────────────────────────────────────────────────

export interface SyncResult {
  created: number;
  updated: number;
  closed: number;
  unchanged: number;
  conflicts: number;
  errors: string[];
}

export interface SyncStatus {
  projectId: string;
  lastSyncedAt: string | null;
  status: "idle" | "syncing" | "error";
  lastResult: SyncResult | null;
}

// ─── Writeback ────────────────────────────────────────────

export interface WritebackResult {
  success: string[];
  failed: { taskId: string; error: string }[];
}

// ─── Conflict ─────────────────────────────────────────────

export type ConflictResolution = "auto_field_merge" | "claude_merge" | "force_external" | "manual";

// ─── Validation ───────────────────────────────────────────

export interface ValidationIssue {
  type: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface TaskValidationResult {
  taskId: string;
  validatedAt: string;
  score: number;
  issues: ValidationIssue[];
  suggestions: string[];
}

// ─── Analytics ────────────────────────────────────────────

export interface CriticalPathNode {
  taskId: string;
  title: string;
  estimatedDays: number;
  assignee: string;
  status: string;
}

export interface CriticalPathResult {
  path: CriticalPathNode[];
  totalEstimatedDays: number;
  projectedCompletionDate: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface ProgressReport {
  projectId: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  projectedCompletionDate: string | null;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
}

export interface GompertzDataPoint {
  date: string;
  cumulativeFound: number;
  cumulativeFixed: number;
  predicted: number;
}

export interface GompertzReport {
  projectId: string;
  generatedAt: string;
  totalBugsFound: number;
  totalBugsFixed: number;
  estimatedTotalBugs: number;
  convergenceDate: string | null;
  confidenceLevel: number;
  dataPoints: GompertzDataPoint[];
}

export interface DecompositionRecommendation {
  taskId: string;
  title: string;
  reason: string;
  estimatedHours: number | null;
  dependencyCount: number;
  onCriticalPath: boolean;
}

export interface FullReport {
  projectId: string;
  generatedAt: string;
  progress: ProgressReport;
  criticalPath: CriticalPathResult;
  decomposition: DecompositionRecommendation[];
  gompertz: GompertzReport | null;
}

// ─── Reminder Settings ────────────────────────────────────

export interface ReminderSettings {
  deadlineWarningDays: number;
  dailyCheckEnabled: boolean;
  dailyCheckTime: string; // "09:00"
  overdueCheckEnabled: boolean;
}

// ─── External Task (from API) ─────────────────────────────

export interface ExternalTask {
  externalId: string;
  externalUrl: string;
  title: string;
  description: string | null;
  status: PMTaskStatus;
  priority: PMPriority;
  assignees: string[];
  labels: string[];
  dueDate: string | null;
  milestoneExternalId: string | null;
  milestoneName: string | null;
  updatedAt: string;
}

export interface ExternalMilestone {
  externalId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  state: "open" | "closed";
  updatedAt: string;
}
