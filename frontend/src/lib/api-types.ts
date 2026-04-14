/**
 * API レスポンス型定義
 *
 * バックエンドのレスポンス形式に対応する TypeScript 型。
 * `request<any>` を排除し、型安全性を確保する。
 */

// ─── Common ─────────────────────────────────────────────────

export interface MessageResponse {
  message: string;
}

export interface DeletedResponse {
  deleted: string;
}

// ─── Auth ───────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  major: string | null;
  calendarAccessId: string | null;
}

export interface UserBasic {
  id: string;
  name: string;
  email: string;
  role: string;
  major: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserWithGroups extends UserBasic {
  groups: Array<{ id: string; name: string; role: string }>;
}

export interface UserListResponse {
  users: UserBasic[];
}

export interface UserListWithGroupsResponse {
  users: UserWithGroups[];
}

export interface UserRoleUpdateResponse {
  user: { id: string; name: string; email: string; role: string };
  message: string;
}

// ─── Profile ───────────────────────────────────────────────

export interface UserProfileData {
  userId: string;
  name?: string;
  email?: string;
  displayName: string | null;
  bio: string;
  avatarUrl: string | null;
}

export interface ProjectRole {
  id: string;
  groupId: string;
  roleName: string;
}

export interface ProjectRoleWithUser extends ProjectRole {
  userId: string;
}

export interface ProfileResponse {
  profile: UserProfileData;
  projectRoles: ProjectRole[];
}

export interface ProfileUpdateResponse {
  message: string;
  profile: Omit<UserProfileData, "name" | "email">;
}

export interface ProjectRolesResponse {
  roles: ProjectRole[];
}

export interface ProjectRolesUpdateResponse {
  message: string;
  roles: ProjectRole[];
}

export interface GroupProjectRolesResponse {
  roles: ProjectRoleWithUser[];
}

// ─── Calendar ───────────────────────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  status: string;
  source: string;
}

export interface CalendarEventsResponse {
  events: GoogleCalendarEvent[];
  connected: boolean;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  color?: string;
}

export interface CalendarListResponse {
  calendars: CalendarInfo[];
}

export interface CalendarStatusResponse {
  connected: boolean;
  email: string;
  hasGoogleAuth: boolean;
  googleScopes: string[];
  hasCalendarScope: boolean;
}

export interface PersonalEvent {
  id: string;
  userId?: string;
  title: string;
  description: string | null;
  day: number;
  period: number;
  duration: number;
  eventType: string;
  planId: string | null;
  startTime: string | null;
  endTime: string | null;
  isPrivate: boolean;
  createdAt?: string;
}

export interface PersonalEventsResponse {
  events: PersonalEvent[];
}

export interface Plan {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  days: number[];
  startPeriod: number;
  duration: number;
  eventType: string;
  isPrivate: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface PlansResponse {
  plans: Plan[];
}

export interface ConflictSlot {
  day: number;
  period: number;
  items: Array<{ type: string; title: string; source: string }>;
}

export interface ConflictsResponse {
  conflicts: ConflictSlot[];
}

// ─── M1 Schema ──────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  createdAt: string;
}

export interface Instructor {
  id: string;
  name: string;
  createdAt: string;
}

export interface Curriculum {
  id: string;
  name: string;
  departmentId: string;
  instructorId: string | null;
  periods: number;
  departmentIds?: string[];
  termId: string | null;
  createdAt: string;
}

export interface AvailableSlot {
  id?: string;
  instructorId?: string;
  day: number;
  periods: number[];
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  type: string;
  equipment: string[];
}

export interface GroupScheduleEntry {
  id: string;
  groupId: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  date: string | null;
  scheduleType: string;
  label: string | null;
  createdBy: string;
  createdAt: string;
  groupName: string;
}

// ─── Groups ─────────────────────────────────────────────────

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  role: string;
  createdAt: string;
}

export interface GroupMyResponse {
  groups: GroupSummary[];
}

export interface GroupMember {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface GroupEvent {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  date: string;
  endDate: string | null;
  allDay: boolean;
  period: number | null;
  duration: number;
  eventType: string;
  createdBy: string;
}

export interface GroupDetailResponse {
  group: {
    id: string;
    name: string;
    description: string | null;
    enabledModules: string[];
    members: GroupMember[];
    schedules: GroupScheduleEntry[];
    events: GroupEvent[];
  };
}

export interface GroupCreateResponse {
  groupId: string;
  message: string;
}

export interface GroupEventsResponse {
  events: GroupEvent[];
}

export interface GroupEventResponse {
  event: GroupEvent;
}

export interface GroupScheduleResponse {
  schedule: GroupScheduleEntry;
}

// ─── Reservations (M4) ─────────────────────────────────────

export interface Reservation {
  id: string;
  groupId: string;
  title: string;
  day: number;
  period: number;
  roomId: string;
  createdBy: string;
  participants: string[];
  status: string;
  note: string;
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ReservationListResponse {
  reservations: Reservation[];
}

export interface RoomAvailability {
  id: string;
  name: string;
  capacity: number;
  type: string;
  freeSlots: Array<{ day: number; period: number }>;
  occupiedCount: number;
}

export interface RoomScheduleResponse {
  roomId: string;
  reservations: Reservation[];
  classSchedule: Array<{
    id: string;
    termId: string;
    curriculumId: string;
    day: number;
    period: number;
    roomId: string;
    candidateCount: number;
  }>;
}

// ─── Webhooks (M5) ──────────────────────────────────────────

export type NotificationPlatform = "generic" | "slack" | "discord" | "line";
export type SendMethod = "webhook" | "bot";

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  platform: NotificationPlatform;
  sendMethod: SendMethod;
  channelId: string | null;
  isActive: boolean;
  failCount: number;
  lastDeliveredAt: string | null;
  createdAt: string;
}

export interface WebhookCreateResponse extends Webhook {
  secret: string;
}

export interface WebhookListResponse {
  webhooks: Webhook[];
}

export interface WebhookTestResponse {
  delivered: boolean;
  statusCode: number;
  latencyMs: number;
  platform?: string;
}

export interface WebhookRotateResponse {
  id: string;
  secret: string;
  message: string;
}

export interface NotificationTemplateItem {
  id: string;
  event: string;
  platform: string;
  title: string;
  body: string;
  useCodeBlock: boolean;
  codeBlockLang: string | null;
  isDefault: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplateListResponse {
  templates: NotificationTemplateItem[];
}

export interface NotificationTemplateResponse {
  template: NotificationTemplateItem;
}

export interface TemplatePreviewResponse {
  rendered: {
    title: string;
    body: string;
    useCodeBlock: boolean;
    codeBlockLang: string | null;
  };
}

export interface TestSendResponse {
  delivered: boolean;
  statusCode: number | null;
  latencyMs: number;
  platform: string;
  sendMethod: string;
  rendered: {
    title: string;
    body: string;
    useCodeBlock: boolean;
    codeBlockLang: string | null;
  };
}

export interface MorningReminderResponse {
  message: string;
  sent: boolean;
  count?: number;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: string;
  statusCode: number;
  deliveryId: string;
  timestamp: string;
  responseTime: number;
  errorMessage: string | null;
}

export interface WebhookLogsResponse {
  logs: WebhookLog[];
}

export interface NotificationPreference {
  channel: string;
  enabledEvents: string[];
  reminder: {
    dayBefore: boolean;
    dayBeforeTime: string;
    morningOf: boolean;
    morningOfTime: string;
    before: boolean;
    beforeMinutes: number;
  };
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface NotificationPreferencesResponse {
  userId: string;
  preferences: NotificationPreference[];
}

export interface NotificationHistoryItem {
  id: string;
  userId?: string;
  event: string;
  channel: string;
  status?: string;
  title: string;
  body: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

export interface NotificationHistoryResponse {
  notifications: NotificationHistoryItem[];
}

// ─── MyPlan ─────────────────────────────────────────────────

export interface MyPlanEntry {
  startTime: string;
  endTime: string;
  title: string;
  period?: number;
  duration?: number;
}

export interface MyPlan {
  id: string;
  userId: string;
  groupId: string | null;
  name: string;
  patternType: "basic" | "special";
  validFrom: string | null;
  validUntil: string | null;
  weeklySchedule: Record<string, MyPlanEntry[]>;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface MyPlanListResponse {
  plans: MyPlan[];
}

export interface MyPlanResponse {
  plan: MyPlan;
  generatedEvents: number;
}

// ─── Smart Scheduler ────────────────────────────────────────

export interface SchedulingTask {
  id: string;
  groupId: string;
  title: string;
  duration: number;
  priority: number;
  preferredDays: number[];
  preferredPeriods: number[];
  instructorId: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulingTaskListResponse {
  tasks: SchedulingTask[];
}

export interface SchedulingTaskResponse {
  task: SchedulingTask;
}

export interface SchedulingPlacement {
  taskId: string;
  title: string;
  day: number;
  period: number;
  duration: number;
  score: number;
}

export interface SolveResponse {
  resultId: string;
  placements: SchedulingPlacement[];
  totalScore: number;
  unplacedTaskIds: string[];
  totalMembers: number;
}

export interface ConfirmResponse {
  message: string;
  placements: SchedulingPlacement[];
}

export interface SchedulingResult {
  id: string;
  groupId: string;
  status: string;
  placements: SchedulingPlacement[];
  totalScore: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface SchedulingResultsResponse {
  results: SchedulingResult[];
}

export interface AvailabilitySlot {
  day: number;
  period: number;
  status: string;
  majorLabel: string | null;
  isPrivate: boolean;
  sourceModule: string;
}

export interface SchedulerAvailabilityResponse {
  availability: AvailabilitySlot[];
  totalMembers: number;
}

// ─── Voting (M6) ────────────────────────────────────────────

export interface VotingCandidate {
  id: string;
  eventId: string;
  label: string;
  sortOrder: number;
}

export interface VotingEvent {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  deadline: string | null;
  status: string;
  createdAt: string;
  candidates: VotingCandidate[];
}

export interface VotingEventCreateResponse {
  id: string;
  title: string;
  candidates: VotingCandidate[];
}

export interface VotingEventListResponse {
  events: VotingEvent[];
}

export interface Vote {
  id: string;
  eventId?: string;
  candidateId: string;
  userId: string;
  answer: "ok" | "maybe" | "ng";
  comment: string;
  isAutoReply: boolean;
}

export interface VotingEventDetailResponse {
  event: VotingEvent;
  summary: Record<string, { ok: number; maybe: number; ng: number }>;
  responses: Record<string, Record<string, Vote>>;
  respondents: Record<string, string>;
}

export interface VotingSubmitResponse {
  votes: Vote[];
}

export interface VotingAutoReplyResponse {
  autoVotes: Array<{ candidateId: string; label: string; answer: string }>;
  skipped: string[];
  message: string;
}

export interface VotingUpdateResponse {
  message: string;
  eventId: string;
}

// ─── M3 (Legacy Scheduler) ─────────────────────────────────

export interface M3Group {
  id: string;
  name: string;
  members: string[];
}

export interface M3AvailabilitySlot {
  day: number;
  period: number;
  availableCount: number;
  totalMembers: number;
  isFullyAvailable: boolean;
  isPartiallyAvailable: boolean;
  availableRooms: string[];
}

export interface M3AvailabilityResponse {
  groupId: string;
  availability: M3AvailabilitySlot[];
  totalMembers: number;
}

export interface M3Suggestion {
  day: number;
  period: number;
  score: number;
  availableCount: number;
  totalMembers: number;
  availableRooms: string[];
  reasons: string[];
}

export interface M3SuggestionsResponse {
  groupId: string;
  suggestions: M3Suggestion[];
  totalMembers: number;
}

// ─── M1 Legacy Schedule ─────────────────────────────────────

export interface ScheduleEntry {
  day: number;
  period: number;
  curriculumId: string;
  curriculumName?: string;
  roomId: string;
  roomName?: string;
  instructorId: string;
  instructorName?: string;
  departmentName?: string;
  candidateCount: number;
  isConfirmed?: boolean;
}

export interface ScheduleResponse {
  entries: ScheduleEntry[];
}

export interface GenerateStats {
  placed: number;
  unplaced: number;
  mode?: string;
}

export interface GenerateResponse {
  message: string;
  entries: ScheduleEntry[];
  stats?: GenerateStats;
}

export interface SwapResponse {
  success: boolean;
  message?: string;
  entries?: ScheduleEntry[];
}

// ─── Holidays ───────────────────────────────────────────────

export interface Holiday {
  id: string;
  name: string;
  date: string;
  endDate: string | null;
  holidayType: string;
  groupId: string | null;
  recurrence: string | null;
}

export interface HolidayListResponse {
  holidays: Holiday[];
}

// ─── API Clients (外部API連携) ─────────────────────────────

export interface ApiClientInfo {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiClientCreated extends ApiClientInfo {
  clientSecret: string;
}

export interface ApiClientListResponse {
  clients: ApiClientInfo[];
}

export interface ApiClientCreateResponse {
  client: ApiClientCreated;
  warning: string;
}

export interface ApiClientRegenerateResponse {
  client: ApiClientCreated;
  warning: string;
}

export interface ApiClientUpdateResponse {
  client: ApiClientInfo | null;
}

// ─── Reminders ─────────────────────────────────────────────

export interface ReminderItem {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  remindAt: string;
  repeatRule: string;
  status: string;
  source: string;
  originalText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderListResponse {
  reminders: ReminderItem[];
}

export interface ReminderResponse {
  reminder: ReminderItem;
}

export interface ReminderParseResponse {
  reminder: ReminderItem;
  parsed: {
    title: string;
    remindAt: string;
    confidence: number;
  };
}

// ─── M3 MACHINA ────────────────────────────────────────────

export interface MachinaTaskItem {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  source: string;
  sourcePlatform: string | null;
  sourceMessageId: string | null;
  sourceChannelId: string | null;
  sourceText: string | null;
  confidence: number;
  isCriticalPath: boolean;
  relayedToPm: boolean;
  pmTaskId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MachinaTaskListResponse {
  tasks: MachinaTaskItem[];
}

export interface MachinaTaskDetailResponse {
  task: MachinaTaskItem;
  logs: MachinaTaskLogItem[];
}

export interface MachinaTaskLogItem {
  id: string;
  taskId: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  triggerMessageId: string | null;
  performedBy: string;
  createdAt: string;
}

export interface MachinaTaskLogListResponse {
  logs: MachinaTaskLogItem[];
}

export interface MachinaChannelMonitorItem {
  id: string;
  groupId: string;
  platform: string;
  channelId: string;
  channelName: string;
  webhookEndpointId: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MachinaMonitorListResponse {
  monitors: MachinaChannelMonitorItem[];
}

export interface MachinaAnalysisResponse {
  analysis: {
    shouldCreateTask: boolean;
    shouldUpdateExisting: boolean;
    title: string;
    description: string | null;
    priority: string;
    assigneeHint: string | null;
    dueDateHint: string | null;
    confidence: number;
    reasoning: string;
    isCompletion: boolean;
  };
}

export interface MachinaStatusResponse {
  module: string;
  description: string;
  pmRelayConnected: boolean;
  features: string[];
}

// ─── WS Real-time Notifications ─────────────────────────────

export interface WsNotification {
  type: "notification";
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ─── Activity Logs ──────────────────────────────────────────

export interface ActivityLog {
  userId: string;
  userName: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface ActivityLogsResponse {
  logs: ActivityLog[];
}

// ─── PM (Project Management) ──────────────────────────────

export interface PMProject {
  id: string;
  name: string;
  source: string;
  sourceConfig: Record<string, string>;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PMTask {
  id: string;
  projectId: string;
  externalId: string;
  externalUrl: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignees: string[];
  labels: string[];
  dueDate: string | null;
  milestoneExternalId: string | null;
  milestoneName: string | null;
  estimatedHours: number | null;
  blockedBy: string[];
  dirtyFlag: number;
  localUpdatedAt: string | null;
  externalUpdatedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PMTaskSnapshot {
  id: string;
  taskId: string;
  changeType: string;
  changedFields: Record<string, { before: unknown; after: unknown }>;
  snapshotData: Record<string, unknown>;
  detectedAt: string;
}

export interface PMMilestone {
  id: string;
  projectId: string;
  externalId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  state: string;
}

export interface PMConflict {
  id: string;
  taskId: string;
  projectId: string;
  localVersion: Record<string, unknown>;
  externalVersion: Record<string, unknown>;
  baseVersion: Record<string, unknown>;
  resolution: string;
  resolvedData: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PMValidationResult {
  taskId: string;
  validatedAt: string;
  score: number;
  issues: { type: string; message: string; severity: string }[];
  suggestions: string[];
}

export interface PMSyncResult {
  result: {
    created: number;
    updated: number;
    closed: number;
    unchanged: number;
    conflicts: number;
    errors: string[];
  };
  lastSyncedAt: string;
}

export interface PMProgressReport {
  projectId: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  projectedCompletionDate: string | null;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
}

export interface PMCriticalPathNode {
  taskId: string;
  title: string;
  estimatedDays: number;
  assignee: string;
  status: string;
}

export interface PMCriticalPathResult {
  path: PMCriticalPathNode[];
  totalEstimatedDays: number;
  projectedCompletionDate: string;
  riskLevel: string;
}

export interface PMDecompositionRecommendation {
  taskId: string;
  title: string;
  reason: string;
  estimatedHours: number | null;
  dependencyCount: number;
  onCriticalPath: boolean;
}

export interface PMGompertzReport {
  projectId: string;
  generatedAt: string;
  totalBugsFound: number;
  totalBugsFixed: number;
  estimatedTotalBugs: number;
  convergenceDate: string | null;
  confidenceLevel: number;
  dataPoints: { date: string; cumulativeFound: number; cumulativeFixed: number; predicted: number }[];
}

export interface PMFullReport {
  projectId: string;
  generatedAt: string;
  progress: PMProgressReport;
  criticalPath: PMCriticalPathResult;
  decomposition: PMDecompositionRecommendation[];
  gompertz: PMGompertzReport | null;
}

export interface PMReminderSettings {
  deadlineWarningDays: number;
  dailyCheckEnabled: boolean;
  dailyCheckTime: string;
  overdueCheckEnabled: boolean;
}

export interface PMReminderTestResult {
  message: string;
  warningCount: number;
  overdueCount: number;
  warningTasks: { id: string; title: string; dueDate: string | null }[];
  overdueTasks: { id: string; title: string; dueDate: string | null }[];
}

// ─── Integrations ───────────────────────────────────────────

export interface SyncLog {
  id: string;
  service: string;
  action: string;
  localEventId?: string;
  externalId?: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
}

export interface NotionPage {
  id: string;
  title?: string;
  url?: string;
  properties?: Record<string, unknown>;
  createdTime?: string;
  lastEditedTime?: string;
}
