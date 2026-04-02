# M2: PM (Project Management) モジュール計画書

## 概要

タスク管理ツール（GitHub Issues / Notion Database）と連携し、プロジェクト管理を自動化するモジュール。タスクの変更検知・通知、リマインダー、タスク内容の検証支援、クリティカルパス分析を提供する。

---

## モジュール構成

```
modules/pm/
├── index.ts                    # SchulaModule エクスポート & ルーター統合
├── routes.ts                   # メイン API ルート
├── sync/
│   ├── github-sync.ts          # GitHub Issues 双方向同期
│   ├── notion-sync.ts          # Notion Database 双方向同期
│   ├── diff-detector.ts        # タスク変更差分の比較ロジック
│   ├── conflict-resolver.ts    # コンフリクト検知・解決 (Claude Code 連携)
│   └── writeback.ts            # Schedula → 外部ソースへの書き戻し
├── reminder/
│   └── deadline-checker.ts     # 納期チェック & リマインダー発火
├── validation/
│   └── task-validator.ts       # タスク内容の検証ロジック
├── analytics/
│   ├── critical-path.ts        # クリティカルパス検知 & タスク分解判断
│   └── gompertz.ts             # ゴンペルツ曲線 (バグ収束予測)
└── types.ts                    # PM モジュール固有の型定義
```

---

## 1. タスク定期取得 & 変更通知

### 1.1 データソース

| ソース | 取得対象 | API |
|--------|----------|-----|
| GitHub Issues | Issue (title, body, state, labels, assignees, milestone) | GitHub REST API v3 |
| Notion Database | Page (properties, status, assignee, due date) | Notion API v1 |

### 1.2 同期フロー (双方向)

同期は **外部 → Schedula** (Pull) と **Schedula → 外部** (Push) の双方向で動作する。
マイルストーン・タスク情報は **連携先 DB の変更を正 (Source of Truth)** とし、コンフリクト時のみ特別処理を行う。

#### Pull フロー (外部 → Schedula)

```
[Cron / 手動トリガー]
    │
    ▼
┌──────────────────────┐
│  GitHub/Notion API    │  外部APIからタスク・マイルストーン一覧を取得
│  Fetch Tasks          │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  diff-detector.ts     │  前回スナップショットと外部データを比較
│  Compare Snapshots    │  → 新規 / 更新 / 削除 を検出
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  conflict-resolver.ts │  Schedula側にも未同期の変更がある場合
│  Conflict Check       │  → コンフリクト解決フローへ (§1.7)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  DB Upsert            │  pm_tasks テーブルに最新状態を保存
│  (repository.ts)      │  pm_task_snapshots に差分履歴を保存
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  emitEvent()          │  通知モジュール経由で通知
│  → Imperativius       │  Imperativius Webhook チャネルで配信
└──────────────────────┘
```

#### Push フロー (Schedula → 外部)

Schedula 上でタスクを編集した場合、変更を外部ソースに書き戻す。

```
[Schedula UI / API でタスク更新]
    │
    ▼
┌──────────────────────┐
│  DB Update            │  pm_tasks を更新
│  + dirtyFlag = true   │  localUpdatedAt を記録
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  writeback.ts         │  dirtyFlag が立ったタスクを検出
│  Push to External     │  GitHub API / Notion API で書き戻し
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  dirtyFlag = false    │  書き戻し成功後にフラグクリア
│  externalUpdatedAt    │  外部側の更新タイムスタンプを記録
│  = response.updatedAt │  (次回 Pull で自己変更をスキップ)
└──────────────────────┘
```

### 1.3 差分検知対象フィールド

| フィールド | 検知内容 |
|-----------|---------|
| `status` | ステータス変更 (open → in_progress → closed) |
| `assignees` | 担当者の追加・変更・解除 |
| `title` | タイトル変更 |
| `labels` / `tags` | ラベル追加・削除 |
| `dueDate` | 納期の変更 |
| `priority` | 優先度変更 |
| `body` / `description` | 本文の変更 (ハッシュ比較) |

### 1.4 通知イベント

既存の通知モジュール (`modules/notification/`) の `emitEvent()` を利用。Imperativius は Webhook エンドポイントとして登録する。

```typescript
// 新規 EVENT_NAMES (src/shared/constants.ts に追加)
PM_TASK_CREATED:    "pm.task.created"      // タスク新規作成
PM_TASK_UPDATED:    "pm.task.updated"      // タスク更新
PM_TASK_CLOSED:     "pm.task.closed"       // タスク完了
PM_TASK_REOPENED:   "pm.task.reopened"     // タスク再オープン
PM_TASK_ASSIGNED:   "pm.task.assigned"     // 担当者変更
PM_DEADLINE_WARNING:"pm.deadline.warning"  // 納期警告
PM_DEADLINE_OVERDUE:"pm.deadline.overdue"  // 納期超過
PM_REPORT_READY:    "pm.report.ready"      // 分析レポート生成
```

### 1.5 Imperativius 連携

Imperativius は既存の Webhook チャネルとして動作する。`webhookEndpoints` テーブルに Imperativius のエンドポイントを登録し、PM イベントを購読する設計。

```
POST /api/webhooks/webhooks
{
  "url": "https://imperativius.example.com/webhook",
  "events": ["pm.*"],
  "platform": "generic",
  "sendMethod": "POST"
}
```

専用の追加対応は不要。既存の `dispatchToPlatform()` → `retryWebhookDelivery()` の配信パイプラインがそのまま利用可能。

### 1.6 API エンドポイント

```
# プロジェクト管理
POST   /api/pm/projects                    # プロジェクト作成 (外部ソース接続)
GET    /api/pm/projects                    # プロジェクト一覧
GET    /api/pm/projects/:id                # プロジェクト詳細
PUT    /api/pm/projects/:id                # プロジェクト設定変更
DELETE /api/pm/projects/:id                # プロジェクト削除

# タスク同期
POST   /api/pm/projects/:id/sync          # 手動同期トリガー (双方向)
GET    /api/pm/projects/:id/sync/status    # 同期状態確認

# タスク一覧・詳細・編集
GET    /api/pm/projects/:id/tasks          # タスク一覧
GET    /api/pm/tasks/:taskId               # タスク詳細
PUT    /api/pm/tasks/:taskId               # タスク編集 (→ 外部に書き戻し)
GET    /api/pm/tasks/:taskId/history       # タスク変更履歴

# コンフリクト管理
GET    /api/pm/projects/:id/conflicts      # 未解決コンフリクト一覧
POST   /api/pm/conflicts/:conflictId/resolve  # コンフリクト手動解決
POST   /api/pm/conflicts/:conflictId/auto-merge  # Claude Code マージ実行
```

### 1.7 双方向同期 & コンフリクト解決

#### 正のデータソース (Source of Truth)

- **外部 DB (GitHub / Notion) の変更を正とする。** Pull 時に外部データで Schedula を上書きするのが基本動作
- マイルストーン (GitHub Milestones / Notion の期限プロパティ) も外部の値を常に優先する
- Schedula 側でのみ保持するメタデータ (検証結果、分析キャッシュ等) は上書きしない

#### コンフリクト検知条件

Pull 時に以下の **両方** が成立するとコンフリクトと判定する:

```
条件: localUpdatedAt > lastSyncedAt  AND  externalUpdatedAt > lastSyncedAt
(= 前回同期以降に Schedula 側と外部側の両方で変更があった)
```

#### コンフリクト解決戦略 (3段階)

```typescript
type ConflictResolution = "auto_external" | "claude_merge" | "manual";

interface ConflictRecord {
  id: string;
  taskId: string;
  localVersion: TaskSnapshot;     // Schedula 側の状態
  externalVersion: TaskSnapshot;  // 外部側の状態
  baseVersion: TaskSnapshot;      // 前回同期時点の状態 (3-way merge 用)
  resolution: ConflictResolution;
  resolvedData: TaskSnapshot | null;
  status: "pending" | "resolved" | "failed";
  createdAt: string;
  resolvedAt: string | null;
}
```

**Stage 1: 自動解決 (小さな差分)**

変更フィールドが重複しない場合、フィールド単位でマージする。

```
例: 外部で title を変更 + Schedula で labels を変更
→ 両方の変更を取り込み (フィールドレベルマージ)
```

**Stage 2: Claude Code マージ (内容コンフリクト)**

同一フィールドに異なる変更がある場合、Claude Code を起動して自動マージする。

```typescript
// conflict-resolver.ts
async function resolveWithClaudeCode(conflict: ConflictRecord): Promise<TaskSnapshot> {
  const prompt = buildMergePrompt(conflict.baseVersion, conflict.localVersion, conflict.externalVersion);

  // Claude Code SDK (claude_agent_sdk) を利用
  const result = await claudeAgent.run({
    prompt,
    tools: [],  // テキストマージのみ、ツール不要
    maxTokens: 4096,
  });

  return parseMergedTask(result.output);
}

function buildMergePrompt(
  base: TaskSnapshot,
  local: TaskSnapshot,
  external: TaskSnapshot
): string {
  return `
以下の3つのバージョンのタスクデータをマージしてください。
コンフリクトがあるフィールドは、文脈を読み取り最適な統合を行ってください。

## ベース (前回同期時点)
${JSON.stringify(base, null, 2)}

## ローカル (Schedula 側の変更)
${JSON.stringify(local, null, 2)}

## 外部 (GitHub/Notion 側の変更)
${JSON.stringify(external, null, 2)}

## ルール
- 外部側の構造的変更 (ステータス、マイルストーン、担当者) を優先する
- 本文 (description) はセマンティックマージする
- マージ結果を JSON で返してください
`;
}
```

**Stage 3: 大幅な乖離 → 外部を優先**

以下の場合、**新しい方 (外部データ) をそのまま採用**する:

```typescript
function shouldForceExternal(conflict: ConflictRecord): boolean {
  const diffRatio = calculateDiffRatio(
    conflict.baseVersion,
    conflict.externalVersion
  );

  // 変更率が 70% を超える = 大幅に違う → 外部を正として上書き
  if (diffRatio > 0.7) return true;

  // ステータスが大きく異なる (例: local=open, external=closed)
  if (isStatusMajorChange(conflict.localVersion, conflict.externalVersion)) return true;

  return false;
}
```

#### コンフリクト解決フロー図

```
[Pull 時に差分検出]
    │
    ▼
┌─────────────────────────┐
│  両側に変更あり?          │──── No ──→ [外部で上書き (通常Pull)]
│  (コンフリクト判定)       │
└──────────┬──────────────┘
           │ Yes
           ▼
┌─────────────────────────┐
│  変更率 > 70%?           │──── Yes ──→ [外部を採用 (Stage 3)]
│  (大幅な乖離チェック)     │            Schedula側変更は snapshot に保存
└──────────┬──────────────┘
           │ No
           ▼
┌─────────────────────────┐
│  変更フィールドが重複?    │──── No ──→ [フィールドマージ (Stage 1)]
│  (フィールドレベル判定)   │
└──────────┬──────────────┘
           │ Yes
           ▼
┌─────────────────────────┐
│  Claude Code マージ      │  3-way merge プロンプト生成
│  (Stage 2)               │  → マージ結果を DB に保存
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  マージ結果を外部に       │  writeback.ts で GitHub/Notion に反映
│  書き戻し (Push)          │  → 両側を統一状態にする
└─────────────────────────┘
```

#### 書き戻し (Schedula → 外部)

Schedula 上でタスクを編集すると、`pm_tasks.dirtyFlag = true` がセットされ、次回の同期サイクルまたは即時に外部に書き戻す。

```typescript
// writeback.ts
export async function pushDirtyTasks(projectId: string): Promise<WritebackResult> {
  const dirtyTasks = await pmTaskRepo.findDirty(projectId);
  const project = await pmProjectRepo.findById(projectId);
  const results: WritebackResult = { success: [], failed: [] };

  for (const task of dirtyTasks) {
    try {
      if (project.source === "github") {
        await updateGitHubIssue(project.sourceConfig, task);
      } else if (project.source === "notion") {
        await updateNotionPage(project.sourceConfig, task);
      }

      // 書き戻し成功 → フラグクリア & 外部タイムスタンプ更新
      await pmTaskRepo.update(task.id, {
        dirtyFlag: false,
        externalUpdatedAt: new Date().toISOString(),
      });
      results.success.push(task.id);
    } catch (err) {
      results.failed.push({ taskId: task.id, error: String(err) });
    }
  }

  return results;
}

// GitHub Issue 更新
async function updateGitHubIssue(
  config: SourceConfig,
  task: PMTask
): Promise<void> {
  const { owner, repo, token } = config;
  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${task.externalId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: task.title,
        body: task.description,
        state: task.status === "closed" ? "closed" : "open",
        labels: task.labels,
        assignees: task.assignees,
        milestone: task.milestoneExternalId ?? undefined,
      }),
    }
  );
}
```

#### 通知イベント (コンフリクト関連)

```typescript
// EVENT_NAMES に追加
PM_SYNC_CONFLICT:       "pm.sync.conflict"        // コンフリクト検出
PM_SYNC_AUTO_MERGED:    "pm.sync.auto_merged"     // 自動マージ完了
PM_SYNC_CLAUDE_MERGED:  "pm.sync.claude_merged"   // Claude Code マージ完了
PM_SYNC_FORCE_EXTERNAL: "pm.sync.force_external"  // 外部優先で上書き
PM_WRITEBACK_SUCCESS:   "pm.writeback.success"    // 外部への書き戻し成功
PM_WRITEBACK_FAILED:    "pm.writeback.failed"     // 外部への書き戻し失敗
```

---

## 2. リマインダーサポート

### 2.1 リマインダー種別

| 種別 | タイミング | イベント |
|------|----------|---------|
| 納期 3 日前警告 | `dueDate - 3日` | `pm.deadline.warning` |
| 納期当日通知 | `dueDate` 当日朝 | `pm.deadline.warning` |
| 納期超過通知 | `dueDate` 超過後 | `pm.deadline.overdue` |
| 定期進捗チェック | 設定可能 (デフォルト毎日 9:00) | `pm.report.ready` |

### 2.2 実装方式

既存の `modules/reminder/` のパターンに準拠。Cron ジョブ (またはインターバルタイマー) でチェックし、条件一致時に `emitEvent()` を発火。

```typescript
// deadline-checker.ts
export async function checkDeadlines(): Promise<void> {
  const today = new Date();
  const warningDate = addDays(today, 3);

  // 納期3日前のタスク
  const warningTasks = await pmTaskRepo.findByDueDateRange(today, warningDate);
  for (const task of warningTasks) {
    await emitEvent(EVENT_NAMES.PM_DEADLINE_WARNING, {
      taskId: task.id,
      title: task.title,
      dueDate: task.dueDate,
      assignees: task.assignees,
      projectId: task.projectId,
    });
  }

  // 納期超過タスク
  const overdueTasks = await pmTaskRepo.findOverdue(today);
  for (const task of overdueTasks) {
    await emitEvent(EVENT_NAMES.PM_DEADLINE_OVERDUE, { ... });
  }
}
```

### 2.3 API エンドポイント

```
# リマインダー設定
GET    /api/pm/projects/:id/reminders       # リマインダー設定取得
PUT    /api/pm/projects/:id/reminders       # リマインダー設定更新
POST   /api/pm/projects/:id/reminders/test  # テスト通知送信
```

---

## 3. タスク内容の検証

### 3.1 新規タスク検証 (要件定義サポート)

タスクが作成された時点で本文の充実度を評価し、不足があればアドバイスを通知する。

**チェック項目:**

| 項目 | 判定基準 | アクション |
|------|---------|-----------|
| 本文の文字数 | < 50文字 | 「要件が不十分です」警告 |
| 受入条件の有無 | "完了条件" / "acceptance criteria" がない | 掘り下げ質問を生成 |
| 見積もりの有無 | ラベル/フィールドに見積もりなし | 見積もり付与を推奨 |
| 依存関係の明記 | ブロッカーの記載なし | 依存タスクの確認を推奨 |

**検証結果の保存:**

```typescript
interface TaskValidationResult {
  taskId: string;
  validatedAt: string;
  score: number;              // 0-100 充実度スコア
  issues: ValidationIssue[];  // 検出された問題
  suggestions: string[];      // 改善提案
}
```

### 3.2 ステータス変更時検証 (修正サポート)

タスクのステータスが変更された際に、関連情報を収集・提示する。

**In Progress → Review 時:**
- 関連コミットハッシュの特定: プロジェクトの Git リポジトリから、タスク ID (Issue 番号) を含むコミットを検索
- テストケースの列挙: コミットで変更されたファイルに対応するテストファイルをリストアップ

```typescript
// task-validator.ts
interface StatusChangeValidation {
  taskId: string;
  fromStatus: string;
  toStatus: string;
  relatedCommits: {
    hash: string;
    message: string;
    author: string;
    date: string;
  }[];
  affectedFiles: string[];
  testFiles: string[];          // 対応テストファイル
  testCoverage: "found" | "missing" | "unknown";
}
```

**実装方式:**
- GitHub API の Commit Search (`GET /search/commits?q=issue:123`) を利用
- コミットの diff からファイル一覧を取得
- テストファイルの命名規則 (`*.test.ts`, `*.spec.ts`) でマッチング

### 3.3 API エンドポイント

```
# タスク検証
POST   /api/pm/tasks/:taskId/validate        # タスク内容を検証
GET    /api/pm/tasks/:taskId/validation       # 最新の検証結果取得
GET    /api/pm/tasks/:taskId/related-commits  # 関連コミット検索
GET    /api/pm/tasks/:taskId/test-coverage    # テストカバレッジ確認
```

---

## 4. クリティカルパス検知 & 分析

### 4.1 進捗率の未来予測

各ユーザの過去のタスク完了ペースから、プロジェクト全体の達成率を予測する。

**入力データ:**
- 各ユーザの完了タスク数 / 総タスク数 (時系列)
- タスクの依存関係グラフ
- 各タスクの見積もり工数

**予測モデル:**

```
予測完了率(t) = 現在完了率 + (残タスク数 × ユーザの平均完了速度) × 残り日数
```

ユーザごとの完了速度は直近 N 日間の移動平均で算出。プロジェクト全体の予測は、クリティカルパス上のタスクのみで計算する。

### 4.2 クリティカルパス検知

タスクの依存関係 (blockedBy / blocks) から DAG を構築し、最長パスを算出する。

```typescript
interface CriticalPathResult {
  path: {
    taskId: string;
    title: string;
    estimatedDays: number;
    assignee: string;
    status: string;
  }[];
  totalEstimatedDays: number;
  projectedCompletionDate: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}
```

**タスク分解の自動判断:**
- 見積もり工数がチーム平均の 2倍以上 → 分解推奨
- クリティカルパス上かつ単一担当 → 並列化のための分解推奨
- 依存タスクが 3 つ以上 → ボトルネック警告

### 4.3 ゴンペルツ曲線 (バグ収束予測)

バグラベルのタスクに対して、累積発見数・累積修正数の推移をゴンペルツ曲線でフィッティングし、収束予測を行う。

**ゴンペルツ関数:**

```
y(t) = a × exp(-b × exp(-c × t))

a: 推定総バグ数 (上限漸近値)
b: 初期遅延パラメータ
c: 成長速度パラメータ
```

**フィッティング手法:**
- 最小二乗法 (Levenberg-Marquardt) で a, b, c を推定
- 軽量実装: 3点法 (データから等間隔の3点を取りパラメータを直接計算)

**出力レポート:**

```typescript
interface GompertzReport {
  projectId: string;
  generatedAt: string;
  totalBugsFound: number;
  totalBugsFixed: number;
  estimatedTotalBugs: number;      // パラメータ a
  convergenceDate: string | null;  // 95%収束予測日
  confidenceLevel: number;         // フィッティング精度 R²
  dataPoints: {
    date: string;
    cumulativeFound: number;
    cumulativeFixed: number;
    predicted: number;
  }[];
}
```

### 4.4 API エンドポイント

```
# 分析・レポート
GET    /api/pm/projects/:id/analytics/progress      # 進捗率 & 未来予測
GET    /api/pm/projects/:id/analytics/critical-path  # クリティカルパス
GET    /api/pm/projects/:id/analytics/decomposition  # タスク分解推奨
GET    /api/pm/projects/:id/analytics/gompertz       # バグ収束曲線
GET    /api/pm/projects/:id/analytics/report         # 総合レポート
```

---

## DB スキーマ設計

### pm_projects

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `name` | TEXT | プロジェクト名 |
| `source` | TEXT | `"github"` \| `"notion"` |
| `sourceConfig` | TEXT (JSON) | 接続設定 (repo, database_id, token等) |
| `syncIntervalMinutes` | INTEGER | 同期間隔 (デフォルト 15) |
| `lastSyncedAt` | TEXT | 最終同期日時 |
| `ownerId` | TEXT FK | 作成者ユーザID |
| `createdAt` | TEXT | 作成日時 |
| `updatedAt` | TEXT | 更新日時 |

### pm_tasks

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `projectId` | TEXT FK | 所属プロジェクト |
| `externalId` | TEXT | 外部ID (Issue番号, Notion Page ID) |
| `externalUrl` | TEXT | 外部URL |
| `title` | TEXT | タイトル |
| `description` | TEXT | 本文 |
| `status` | TEXT | `"open"` \| `"in_progress"` \| `"review"` \| `"closed"` |
| `priority` | TEXT | `"low"` \| `"medium"` \| `"high"` \| `"critical"` |
| `assignees` | TEXT (JSON) | 担当者リスト |
| `labels` | TEXT (JSON) | ラベルリスト |
| `dueDate` | TEXT | 納期 |
| `milestoneExternalId` | TEXT | 外部マイルストーンID |
| `milestoneName` | TEXT | マイルストーン名 (外部から同期) |
| `estimatedHours` | REAL | 見積もり工数 |
| `blockedBy` | TEXT (JSON) | 依存タスクID リスト |
| `descriptionHash` | TEXT | 本文ハッシュ (差分検知用) |
| `dirtyFlag` | INTEGER | `0` = 同期済み, `1` = 要書き戻し |
| `localUpdatedAt` | TEXT | Schedula 側の最終更新日時 |
| `externalUpdatedAt` | TEXT | 外部側の最終更新日時 |
| `lastSyncedAt` | TEXT | 最後に正常同期した日時 |
| `createdAt` | TEXT | 作成日時 |
| `updatedAt` | TEXT | 更新日時 |

### pm_task_snapshots

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `taskId` | TEXT FK | タスクID |
| `changeType` | TEXT | `"created"` \| `"updated"` \| `"closed"` \| `"reopened"` |
| `changedFields` | TEXT (JSON) | 変更フィールドと before/after |
| `snapshotData` | TEXT (JSON) | 変更時点の全データ |
| `detectedAt` | TEXT | 検出日時 |

### pm_task_validations

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `taskId` | TEXT FK | タスクID |
| `score` | INTEGER | 充実度スコア (0-100) |
| `issues` | TEXT (JSON) | 検出された問題リスト |
| `suggestions` | TEXT (JSON) | 改善提案リスト |
| `relatedCommits` | TEXT (JSON) | 関連コミット情報 |
| `testFiles` | TEXT (JSON) | 対応テストファイル |
| `validatedAt` | TEXT | 検証日時 |

### pm_conflicts

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `taskId` | TEXT FK | 対象タスクID |
| `projectId` | TEXT FK | プロジェクトID |
| `localVersion` | TEXT (JSON) | Schedula 側のスナップショット |
| `externalVersion` | TEXT (JSON) | 外部側のスナップショット |
| `baseVersion` | TEXT (JSON) | 前回同期時点のスナップショット (3-way merge 用) |
| `resolution` | TEXT | `"auto_field_merge"` \| `"claude_merge"` \| `"force_external"` \| `"manual"` |
| `resolvedData` | TEXT (JSON) | マージ結果 |
| `status` | TEXT | `"pending"` \| `"resolved"` \| `"failed"` |
| `createdAt` | TEXT | 検出日時 |
| `resolvedAt` | TEXT | 解決日時 |

### pm_milestones

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `projectId` | TEXT FK | プロジェクトID |
| `externalId` | TEXT | 外部マイルストーンID |
| `title` | TEXT | マイルストーン名 |
| `description` | TEXT | 説明 |
| `dueDate` | TEXT | 期限 |
| `state` | TEXT | `"open"` \| `"closed"` |
| `externalUpdatedAt` | TEXT | 外部側の最終更新日時 |
| `createdAt` | TEXT | 作成日時 |
| `updatedAt` | TEXT | 更新日時 |

### pm_analytics_cache

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT PK | UUID |
| `projectId` | TEXT FK | プロジェクトID |
| `reportType` | TEXT | `"progress"` \| `"critical_path"` \| `"gompertz"` |
| `data` | TEXT (JSON) | レポートデータ |
| `generatedAt` | TEXT | 生成日時 |
| `expiresAt` | TEXT | キャッシュ有効期限 |

---

## フロントエンド設計

### ページ構成

| パス | ページ | 内容 |
|------|--------|------|
| `/pm` | `PMDashboardPage.tsx` | プロジェクト一覧 & サマリー |
| `/pm/:projectId` | `PMProjectPage.tsx` | タスクボード (テーブルビュー) |
| `/pm/:projectId/analytics` | `PMAnalyticsPage.tsx` | 分析ダッシュボード |

### API 定義 (`frontend/src/lib/api.ts`)

```typescript
export const pm = {
  // Projects
  listProjects: () => request<{ projects: PMProject[] }>("/api/pm/projects"),
  getProject: (id: string) => request<PMProject>(`/api/pm/projects/${id}`),
  createProject: (data: CreateProjectInput) => request<PMProject>("/api/pm/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: UpdateProjectInput) => request<PMProject>(`/api/pm/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<void>(`/api/pm/projects/${id}`, { method: "DELETE" }),

  // Sync
  triggerSync: (projectId: string) => request<SyncStatus>(`/api/pm/projects/${projectId}/sync`, { method: "POST" }),
  getSyncStatus: (projectId: string) => request<SyncStatus>(`/api/pm/projects/${projectId}/sync/status`),

  // Tasks
  listTasks: (projectId: string) => request<{ tasks: PMTask[] }>(`/api/pm/projects/${projectId}/tasks`),
  getTask: (taskId: string) => request<PMTask>(`/api/pm/tasks/${taskId}`),
  getTaskHistory: (taskId: string) => request<{ history: TaskSnapshot[] }>(`/api/pm/tasks/${taskId}/history`),

  // Validation
  validateTask: (taskId: string) => request<TaskValidationResult>(`/api/pm/tasks/${taskId}/validate`, { method: "POST" }),
  getValidation: (taskId: string) => request<TaskValidationResult>(`/api/pm/tasks/${taskId}/validation`),
  getRelatedCommits: (taskId: string) => request<RelatedCommit[]>(`/api/pm/tasks/${taskId}/related-commits`),

  // Reminders
  getReminders: (projectId: string) => request<ReminderSettings>(`/api/pm/projects/${projectId}/reminders`),
  updateReminders: (projectId: string, data: ReminderSettings) => request<ReminderSettings>(`/api/pm/projects/${projectId}/reminders`, { method: "PUT", body: JSON.stringify(data) }),

  // Analytics
  getProgress: (projectId: string) => request<ProgressReport>(`/api/pm/projects/${projectId}/analytics/progress`),
  getCriticalPath: (projectId: string) => request<CriticalPathResult>(`/api/pm/projects/${projectId}/analytics/critical-path`),
  getGompertz: (projectId: string) => request<GompertzReport>(`/api/pm/projects/${projectId}/analytics/gompertz`),
  getFullReport: (projectId: string) => request<FullReport>(`/api/pm/projects/${projectId}/analytics/report`),
};
```

---

## 既存モジュールとの統合

### 通知モジュール (`modules/notification/`)

- `emitEvent()` でイベント発火 → 既存の Webhook 配信パイプラインで Imperativius に配信
- `EVENT_NAMES` に PM 用イベントを追加
- `EVENT_MODULES` に PM モジュールのイベントグループを追加
- 通知テンプレートを `notificationTemplates` テーブルに登録

### app.ts への登録

```typescript
import { pmModule } from "../modules/pm/index.js";

const modules: SchulaModule[] = [schoolModule, pmModule];
```

### CLAUDE.md への追記

```
| `modules/pm/` | `frontend/src/pages/PMDashboardPage.tsx`, `PMProjectPage.tsx`, `PMAnalyticsPage.tsx` | `api.ts` の `pm` |
```

---

## 実装フェーズ

### Phase 1: 基盤 & 単方向同期 (Pull)
1. DB スキーマ追加 (`pm_projects`, `pm_tasks`, `pm_task_snapshots`, `pm_milestones`)
2. リポジトリ関数追加 (`pmProjectRepo`, `pmTaskRepo`, `pmTaskSnapshotRepo`, `pmMilestoneRepo`)
3. GitHub Issues Pull 同期実装 (`github-sync.ts`)
4. 差分検知 (`diff-detector.ts`)
5. 通知イベント統合
6. フロントエンド: プロジェクト一覧 & タスクボード

### Phase 2: 双方向同期 & コンフリクト解決
1. DB スキーマ追加 (`pm_conflicts`), `pm_tasks` に同期カラム追加
2. Schedula → 外部書き戻し (`writeback.ts`) — GitHub Issue / Notion Page 更新
3. コンフリクト検知 (`conflict-resolver.ts`) — Stage 1: フィールドマージ
4. Claude Code SDK 連携 — Stage 2: セマンティックマージ
5. 大幅乖離時の外部優先ロジック — Stage 3: 強制上書き
6. コンフリクト管理 API & フロントエンド UI
7. 通知イベント追加 (`pm.sync.conflict`, `pm.writeback.*`)

### Phase 3: リマインダー & Notion 対応
1. 納期チェッカー (`deadline-checker.ts`)
2. リマインダー設定 API
3. Notion Database 双方向同期実装 (`notion-sync.ts`)
4. フロントエンド: リマインダー設定 UI

### Phase 4: タスク検証
1. タスク内容検証ロジック (`task-validator.ts`)
2. コミットハッシュ特定 (GitHub API 連携)
3. テストファイルマッチング
4. フロントエンド: 検証結果表示

### Phase 5: 分析 & レポート
1. クリティカルパス算出 (`critical-path.ts`)
2. 進捗率予測
3. ゴンペルツ曲線フィッティング (`gompertz.ts`)
4. 分析キャッシュ
5. フロントエンド: 分析ダッシュボード (チャート表示)
