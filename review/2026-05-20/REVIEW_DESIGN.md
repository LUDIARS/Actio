# 設計レビュー（共通）(Design Review) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | feat/split-task-only |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 15261cd .. 8b2dfcb |

---

## 1. 設計強度 (Design Robustness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | 障害分離 | 予定系削除後、タスク系 (modules/task + PM) とコア認証・セッション管理が独立。単一障害点なし。レート制限・エラーハンドリング備え。 |
| B | 冪等性 | task routes の PUT (更新) は冪等。POST (作成) は uuid 生成なので重複リクエスト時に異なる ID で重複作成される可能性。idempotency key 機構なし。 |
| A | 入力バリデーション | title (required) / status (enum) / priority (enum) / deadline (Date parsing) 等が厳密に検証。parseDate() で無効な ISO 8601 を rejection。 |
| A | エラーハンドリング | 404 / 401 / 403 / 400 の分岐明確。app.onError() で uncaught exception 捕捉、本番時は詳細非露出。 |
| B | リトライ・タイムアウト設計 | 非同期処理 (Nuntius reminder scheduling) は try-catch で失敗しても task 作成は成功扱い (best-effort)。リトライ機構なし。外部 I/O (Cernere fetch) にタイムアウト明示なし。 |
| A | 状態管理の明確性 | Task status enum (open/in_progress/blocked/done/cancelled) 明確。状態遷移ルール (done ⇄ completedAt) が routes に組み込み。 |

### チェック項目

- [x] 単一障害点 (SPOF) — 予定系削除で、残ったタスク系は認証・DB への分離度が高い
- [x] 外部サービス障害時の縮退動作 — Cernere fetch 失敗時は Composite に警告出力し続行。Nuntius 失敗は warn log + task 生成は success
- [x] 入力値境界値防御 — status/priority enum チェック + deadline 日付パース。なし値許可は安全設計
- [x] fail-safe 遷移 — 404/401/403 で安全な状態維持。破壊的操作 (DELETE) は owner 確認後
- [x] 非同期タイムアウト・キャンセル — 最小限実装。timeout 未設定
- [x] 競合状態排除 — DB 更新は Drizzle ORM (parameterized) で SQL injection 不可。PUT :id の owner チェック後 update

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| src/index.ts:19-21 | console.log で FRONTEND_URL / GOOGLE_REDIRECT_URI を直出力 | Cernere Composite 初期化ログは設定状態確認用に限定し、具体的なエンドポイント値は非露出 | production では log level 制限；startup diagnostics で機密値マスク化 |
| modules/task/routes.ts:157-158 | GET /:id に所有権チェックなし (owner/assignee の check は DELETE のみ) | Actio CLAUDE.md 個人データ保護ルール: ユーザー FK アンカーの読み出しも最小権限が妥当 | GET /:id で (existing.ownerId === userId \|\| existing.assigneeId === userId) check を追加、または groupId scope visibility rule を明示化 |
| src/db/schema.ts:14-40 | users table に legacy カラム (name/email/role/passwordHash/google_*) 残置 | AIFormat DROP COLUMN 禁止ルール × Cernere 単一情報源ポリシーの矛盾 | 将来的には legacy column を非表示 view に移し、schema からは削除。migration timing を DESIGN.md に記載 |

### チェック項目

- [x] レイヤー依存方向 — route → repo → db ORM。依存は単方向で逆参照なし
- [x] 命名規則統一 — camelCase (JS/TS)、snake_case (SQL)。テーブル名複数形。一貫性あり
- [x] 共通パターン (repository層) — 全 DB 操作は src/db/repository.ts 経由
- [x] ユーティリティ再実装なし — uuid / jsonwebtoken / Drizzle ORM で統一
- [x] 責務配置 — routes (validator + orchestrator) / repo (data access) / auth middleware (JWT verify)
- [x] ハードコード値 — env 変数で外出し。VALID_STATUSES/VALID_PRIORITIES は定数化

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

| モジュール / クラス | 凝集度評価 | 所見 |
|-------------------|-----------|------|
| modules/task/ | 機能的 | task routes は CRUD + plugin registry に集中。予定系削除で負担軽減。単一責務。 |
| modules/pm/ | 機能的 | プロジェクト管理 (GitHub/Notion sync) に専念。pm_* テーブル + pm_* API で独立。 |
| src/middleware/ | 機能的 | auth.ts / rate-limit.ts / request-id.ts / getUserId。各々単一責務。 |
| src/auth/ | 機能的 | composite.ts / routes.ts / session-cache.ts / user-info.ts。関心ごと明確分離。 |
| src/config/ | 機能的 | secrets.ts / jwt.ts / infisical.ts / ssm.ts / env.ts。設定責務に特化。 |
| src/plugins/ | 機能的 | loader.ts / registry.ts / context.ts / admin-routes.ts。モジュール管理責務に統一。 |

### チェック項目

- [x] SRP 違反 — 削除後は責務が明確。routes は request handler に専念
- [x] God Class — taskRoutes/pmRoutes ともに 100-300 行程度で過度でない
- [x] 結合度 — modules/* は app.ts で明示的に installModule()。疎結合
- [x] 循環依存 — src/app.ts → modules/* → src/db/repository。依存方向単方向
- [x] インターフェース分離 — type ActioModule / TaskPlugin で明確な contract
- [x] パッケージ構成 — src/ (core) / modules/ (domain) / packages/ (SDK)

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | B | 1 |
| 2 | 設計思想の一貫性 | A | 0 |
| 3 | モジュール分割度 | A | 0 |

**所見:** split-task-only による大規模削除で設計債務が減少。残った task 系とコア基盤はモジュール分割・依存度管理の成熟度が高い。個人データ非保管ルールと DROP COLUMN ルールの矛盾は長期的な設計課題（= migration roadmap 化が必要）。
