# 実装評価 (Implementation Evaluation)

対象リポジトリ・PR情報を記載し、コード品質・データスキーマ・運用信頼性を評価する。

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ / PR | main (1dbd79a) |
| レビュー実施日 | 2026-04-04 |
| 対象コミット範囲 | リポジトリ全体 |

---

## 1. コード品質 (Code Quality)

可読性・保守性の観点から問題のあるコードを検出する。

| 該当箇所 | 問題分類 | 説明 | 推奨修正 |
|----------|---------|------|---------|
| `src/admin/db-viewer.ts:21` | `any` 型の使用 | `extractRows(result: any): any[]` — CLAUDE.md で `any` 型は禁止されているが、DB 方言差異の吸収のために使用。7箇所で `any` キャスト | `unknown` 型 + 型ガードで方言ごとの結果型を安全に判別する |
| `modules/settings/routes.ts:85` | `any` 型 + コード重複 (DRY 違反) | `extractRows()` が `db-viewer.ts` と同一実装のコピー。`any` 使用も同様 | 共通ユーティリティに抽出 (`src/db/utils.ts` 等) |
| `modules/voting/routes.ts:166,217` | `any` 型の使用 | `saved: any[]`, `autoVotes: any[]` — 投票データの型が明示されていない | Drizzle 推論型 `typeof votes.$inferSelect` を使用 |
| `modules/reservation/routes.ts:195,217` | `any` 型の使用 | `r: any`, `room: any` — リポジトリ戻り値の型が未指定 | リポジトリから返される型を明示的に適用 |
| `modules/school/facility-booking/routes.ts:290,309` | `any` 型 + コード重複 | reservation module と同一の `any` パターン。availability チェックロジックが重複 | 共通関数に抽出し型を付与 |
| `modules/machina/webhook-handler.ts:18` | 論理的凝集の問題 | 通知モジュール内部の `emitEvent` を直接インポート | イベントバスを `src/shared/` に配置 |
| `src/activity-logger.ts:54` | ファイル全体読み込み | `readFileSync` でログファイル全体を読み込み、末尾から取得。ログが肥大化するとメモリ・パフォーマンス問題 | DB テーブルまたは Redis に移行。もしくは末尾からのストリーム読み取り |
| `src/db/migrate.ts:314-319` | マイグレーション手法 | try-catch で ALTER TABLE をラップし、既存カラムの場合はエラーを無視。バージョン管理なし | Drizzle のマイグレーション機能を活用し、バージョン管理されたマイグレーションに移行 |

### チェック項目

- [x] マジックナンバー・マジックストリングが使用されていないか: **主要定数は `src/shared/constants.ts` に集約。期間時間・曜日ラベル・リトライ間隔等。ただし一部の数値リテラル (Redis maxRetries=3, DB maxRetries=10) が直接記述。概ね良好**
- [x] 過度にネストした条件分岐がないか: **早期リターンパターンが一貫して使用されている。ネストは概ね浅い。適切**
- [x] 未使用のコード・デッドコードが残存していないか: **未使用コードは検出されず。適切**
- [ ] コピー&ペーストによる重複コードがないか (DRY違反): **`extractRows()` が db-viewer.ts と settings/routes.ts に重複。reservation と facility-booking の availability チェックが重複**
- [x] 変数・関数のスコープが必要以上に広くないか: **モジュール内にスコープが限定されている。適切**
- [x] 例外の握りつぶし (空の catch ブロック) がないか: **migrate.ts 内のマイグレーション try-catch は意図的 (カラム既存チェック)。コメントで理由記載済み。他に空 catch なし。許容範囲**
- [ ] 不適切な型変換・暗黙的型変換がないか: **`any` 型が約20箇所で使用 (CLAUDE.md 違反)。db-viewer, voting, reservation, facility-booking に集中**
- [x] ログ出力が適切なレベルで記録されているか: **`console.error` でエラー、`console.warn` で警告を区別。ただし構造化ログライブラリ未使用 (後述)**

---

## 2. データスキーマの妥当性・重複確認 (Data Schema Validation)

データモデル・スキーマ定義の妥当性と重複を検証する。

| テーブル / モデル | 問題種別 | 説明 | 推奨対応 |
|-----------------|---------|------|---------|
| `users` | 制約不足 | `googleAccessToken` / `googleRefreshToken` が平文テキスト。暗号化なし | アプリ層で暗号化して保存 (別途脆弱性レビューにも記載) |
| `webhookEndpoints` | 制約不足 | `createdBy` に外部キー制約なし。ユーザ削除時に孤立レコード発生 | `users.id` への FK 参照を追加、または soft delete を導入 |
| `notifications` | 制約不足 | `userId` に外部キー制約なし | 同上 |
| `notificationPreferences` | 制約不足 | `userId` に外部キー制約なし | 同上 |
| `pmProjects` | 制約不足 | `ownerId` に外部キー制約なし | `users.id` への FK 参照を追加 |
| `scheduleEntries` | 制約不足 | `day` (0-6), `period` (0-10) に CHECK 制約なし。アプリ層バリデーションのみ | CHECK 制約を追加 (PostgreSQL) または入力バリデーション強化 |
| 各 enum 的フィールド | 制約不足 | `status` (pending/confirmed 等), `role` (admin/general 等), `priority` に DB レベルの制約なし | CHECK 制約または ENUM 型 (PostgreSQL) を検討 |
| `reservations` + `facility-booking` | 軽微な重複 | `modules/reservation/` と `modules/school/facility-booking/` で予約関連ロジックが一部重複 | facility-booking を正とし、reservation module の重複ロジックを共通化 |

### チェック項目

- [x] 正規化が適切に行われているか: **4NF に概ね準拠。M:N 関係は中間テーブル (curriculumDepartments, groupMembers, userProjectRoles) で解決。JSON カラムは柔軟性のための意図的な非正規化 (periods, weeklySchedule 等)。適切**
- [x] 同一概念を表す複数のモデル定義が存在しないか: **各エンティティは単一テーブルで定義。方言間 (sqlite/postgres/mysql) のスキーマ定義は必要上の重複。問題なし**
- [x] フィールドの型が格納データに対して適切か: **SQLite: integer(timestamp), text(json)。PostgreSQL: timestamp, jsonb。型マッピングは Drizzle が吸収。適切**
- [ ] NOT NULL・UNIQUE・外部キー等の制約が必要十分に設定されているか: **主要 FK は設定済み。ただし `createdBy`, `ownerId`, `userId` (通知系) に FK 未設定が5箇所**
- [x] インデックスがクエリパターンに対して最適化されているか: **60以上のインデックス設定。FK カラム・ステータス・日付に適切にインデックス。複合インデックスも活用 (pm_cache: projectId+reportType)。適切**
- [x] マイグレーションに破壊的変更が含まれていないか: **ALTER TABLE ADD COLUMN のみ。カラム削除なし。安全**
- [x] API のリクエスト/レスポンス定義とDBスキーマの間に矛盾がないか: **リポジトリ層が Drizzle 推論型を使用し、型の一貫性を保証。矛盾なし**
- [x] Enum・定数の定義がコードとスキーマで一致しているか: **`src/shared/constants.ts` の定数がルートハンドラで参照されている。一致**

---

## 3. SRE観点のレビュー (SRE Review)

運用・信頼性の観点でシステムを評価する。

| 評価 | 観点 | 所見 |
|------|------|------|
| C | 可観測性 (Observability) | `console.log/error/warn` ベースのログ出力 (47箇所)。Hono ロガーミドルウェアで HTTP リクエストログ。ファイルベースの操作ログ (`activity-logger.ts`)。ただしリクエスト ID / トレース ID なし。構造化ログライブラリ未使用。メトリクス収集なし |
| B | デプロイ安全性 | Docker Compose 対応。PostgreSQL スキーマプッシュ対応。ただしマイグレーションバージョン管理なし (try-catch ベース)。ロールバック手順は DB restore に依存 |
| B | スケーラビリティ | Redis セッションキャッシュで水平スケーリング対応の下地あり。ただし `activity-logger.ts` がファイルベース (分散環境で不整合)。SQLite デフォルトは単一インスタンス限定 |
| C | 障害復旧 (Disaster Recovery) | ヘルスチェック `/api/health` (DB 接続確認) あり。Redis 障害時は DB フォールバック。ただしバックアップ/リストア手順未整備。Redis のヘルスチェックなし |
| B | 依存関係管理 | package-lock.json でバージョンロック。三段階シークレット管理 (Infisical → SSM → env)。ただし npm audit で5件の脆弱性、CI に脆弱性スキャン未統合 |

### チェック項目

- [ ] 構造化ログが出力されているか: **未実装。console.* ベース。トレースID, リクエストID なし**
- [ ] メトリクス収集が実装されているか: **未実装。Prometheus/OpenTelemetry 等なし。Webhook 配信のレイテンシ記録のみ (DB ログ)**
- [x] ヘルスチェックエンドポイントが存在するか: **`GET /api/health` で DB 接続確認。200/503 を適切に返却。ただし Redis、外部サービス (Google, Notion) のヘルスチェックなし**
- [ ] デプロイがロールバック可能か: **明示的なロールバック手順なし。DB はマイグレーションが ADD COLUMN のみなので実害は少ない**
- [x] 設定変更が再デプロイなしで反映可能か: **シークレットマネージャーが5分ごとに自動リフレッシュ。appSettings テーブルで動的設定可能。適切**
- [x] リソース制限が設定されているか: **PostgreSQL: max connections=10, idle timeout=30s。Redis: maxRetries=3。Webhook: 30s timeout。API limit パラメータに上限 (500)。適切**
- [ ] 水平スケーリングに対応した設計か: **Redis セッション対応。ただし activity-logger がファイルベース、SQLite デフォルトが非分散**
- [ ] バックアップ・リストア手順が確立されているか: **未確認。ドキュメントなし**
- [ ] SLI / SLO が定義されているか: **未定義**
- [ ] インシデント発生時のランブックが存在するか: **未確認**

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 2 (any 型使用約20箇所、DRY 違反2箇所) |
| 2 | データスキーマ | B | 2 (FK 制約不足5箇所、CHECK 制約なし) |
| 3 | SRE | C | 3 (構造化ログなし、メトリクスなし、DR 手順なし) |

**評価基準:**
- **A**: 問題なし。ベストプラクティスに準拠
- **B**: 軽微な改善点あり。運用上の影響は低い
- **C**: 改善が必要。リリース前の対応を推奨
- **D**: 重大な問題あり。即時対応が必要

### 優先対応事項

1. **高優先**: `any` 型を `unknown` + 型ガードに置き換え (CLAUDE.md 規約遵守)
2. **高優先**: 構造化ログライブラリ (Pino) 導入、リクエスト ID 付与
3. **中優先**: FK 制約不足の5箇所を修正
4. **中優先**: `extractRows()` 等の重複コードを共通ユーティリティに抽出
5. **低優先**: マイグレーションを Drizzle 標準機能に移行
