# 実装評価 (Implementation Evaluation) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | main (HEAD `cbcb692`) |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 直近 50 commit (#108 リネーム以降の SDK/Placement/Push) |

---

## 1. コード品質 (Code Quality)

| 該当箇所 | 問題分類 | 説明 | 推奨修正 |
|----------|---------|------|---------|
| `modules/placement/forwarder.ts:33` | マジックナンバー | `AbortSignal.timeout(5000)` の 5s リテラル | `WEBHOOK_TIMEOUT_MS` 定数 / secretManager 経由 |
| `modules/placement/routes.ts:165` | 入力境界 | `radius_m | 0` で `Math.max(1, ...)` だけ。 上限未設定 | `Math.min(100_000, Math.max(1, radius_m | 0))` |
| `modules/placement/repo.ts:88-96` | 戻り値の意味喪失 | `remove()` が常に true、 `void result` で削除件数を捨てている | `db.delete().returning({ id: schema.places.id })` で件数判定 |
| `src/auth/composite.ts:52, 60, 65, 73` | 過剰ログ | `[trace:cernere-exchange]` が常時出力 (本番でも) | `secretManager.get("DEBUG_AUTH")` ガード |
| `src/auth/composite.ts:86-112` | 重複実装 | `jsonwebtoken` を依存に持つのに HMAC 手書き | `jwt.sign()` で書き換え |
| `src/app.ts:187-214` | 未await Promise | `installModule()` × 7 が await されず、 reject はログのみ | `Promise.allSettled` で集約 |
| `src/middleware/auth.ts:46-52` | 型の弱さ | `as { sub?: string; userId?: string; ... }` で payload を強制キャスト | zod / valibot で実行時検証 |
| `modules/placement/routes.ts:94-113` | エラーの握り潰し | `void (async () => {...})()` の中で fireHook 失敗を `console.warn` のみ。 永続化なし | `place_hook_logs` テーブルに失敗履歴を残す (audit) |
| `src/app.ts:53-60` | 情報露出 (dev) | `err.message` を dev で返す。 prod で隠す方針は OK だが、 stack は両方で隠れている | OK (B 評価) |

### チェック項目

- [x] マジックナンバー: 一部あり (5000ms timeout など)
- [x] ネスト浅い、 早期 return パターン採用
- [x] デッドコード: `MODULES.md` に旧 machina/reminder の記述残るが、 ソース側は削除済み (`#7acf5b5`)
- [x] DRY: repo パターンで CRUD 集約、 重複コードなし
- [x] スコープ: 関数内変数は適切に最小
- [ ] 例外握り潰し: webhook fireHook の失敗が console.warn のみ
- [x] 型変換: 暗黙変換ほぼなし、 `as` キャストは payload 読込で限定使用
- [ ] ログレベル: 構造化 JSON は出るが、 `console.log` / `console.warn` の使い分けが流派ばらばら (`[trace:*]` / `[server]` / `[composite]`)

---

## 2. データスキーマの妥当性・重複確認 (Data Schema Validation)

| テーブル / モデル | 問題種別 | 説明 | 推奨対応 |
|-----------------|---------|------|---------|
| `users` (legacy columns) | 重複 / 不要保持 | `users.name` / `email` / `role` / `password_hash` / `google_*` / `last_login_at` は CLAUDE.md で「読み書き禁止」だが DROP COLUMN 禁止ルールでスキーマ残置 | スキーマ上は残置 OK。 ただし `userRepo` の Drizzle 推論型 `User` がこれらを含むため、 利用箇所で混入リスクあり (`auth.ts:67` の sessionUser に payload の name/email が入る) |
| `places` (`src/db/schema.ts:1225-1243`) | 制約不足 | `lat/lon` に CHECK 制約なし。 NOT NULL は付くが範囲制約は schema レベルにない | application 層で validate + マイグレーションで CHECK 追加 |
| `place_hooks` | enum 不整合 | `event: text` で `"enter" | "leave"` をアプリ側だけで enforce | drizzle `text({ enum: ["enter", "leave"] })` 使用 |
| `placement_state.currentPlaceId` | onDelete cascade | `references(() => places.id, { onDelete: "cascade" })` (`schema.ts:1290`) で place 削除時に state 連動。 妥当 |  — |
| `machina_*` テーブル | デッドスキーマ | バックエンド削除済み (#65112a8) だがテーブルは残置 | spec を「アーカイブ」に明記 (既に CLAUDE.md で言及済) |

### チェック項目

- [x] 正規化: 概ね 3NF
- [ ] 同一概念の重複: `users.role` (legacy) と `userProjectRoles` (Cernere 同期) が並走
- [x] 型: lat/lon は real、 ts は timestamp で適切
- [ ] NOT NULL / CHECK: 範囲 CHECK 未付与
- [x] index: `idx_places_user` が付与
- [x] マイグレーション: 破壊的変更回避 (DROP COLUMN 禁止) を遵守
- [x] API vs DB: `places` レスポンス形式と DB column 整合
- [ ] enum: schema 側で enum 化されていないものあり

### 関連 PR

- #118 (placement) で `places` / `place_hooks` / `place_visits` / `placement_state` 4 テーブル追加
- #92 で PostgreSQL の欠落テーブル追加

---

## 3. SRE観点のレビュー (SRE Review)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 可観測性 (Observability) | requestId middleware (`src/middleware/request-id.ts`)、 構造化 access log (`app.ts:76-99`)、 activity-logger でユーザ操作記録。 Prometheus メトリクス / OpenTelemetry trace なし |
| B | デプロイ安全性 | Docker Compose で `app + frontend` 分離、 共有インフラ前提 (`docker-compose.yaml`) と standalone overlay。 ロールバックは docker tag 切替で可能だが手順未文書化 |
| B | スケーラビリティ | Hono + node-server で軽量、 Redis セッションキャッシュで複数 instance 対応可。 WebSocket は単一プロセスバインド (broadcast に redis pub/sub 等の分散基盤なし) |
| B | 障害復旧 (DR) | DB の `db:export` / `db:import` script、 `redis:export` / `redis:import` 用意。 Cernere ダウン時はプレースホルダで縮退、 service-adapter 失敗は user-facing 継続 |
| B | 依存関係管理 | `package.json` の `@ludiars/*` は GitHub Packages、 NODE_AUTH_TOKEN gate。 npm-shrinkwrap ではなく package-lock のみ、 `npm audit` CI 未組込 |

### チェック項目

- [x] 構造化ログ: `[http]/[http-warn]/[http-error]` で JSON
- [ ] メトリクス収集: 未実装
- [x] ヘルスチェック: `/api/health/live` (liveness) + `/api/ready` (readiness) 分離 (#71314da)
- [ ] ロールバック手順: docker tag 戦略は未文書化
- [x] 設定再ロード: secretManager は起動時のみロード (許容)
- [ ] リソース制限: Docker Compose に `mem_limit` 等の指定なし
- [x] ステートレス化: session は Redis、 plugin registry はメモリ (起動時再構築) で対応可
- [x] バックアップ手順: db:export / redis:export script
- [ ] SLI/SLO: 未定義
- [ ] ランブック: 未整備

### 関連 PR

- #97 ヘルスチェック分割 + 構造化ログ middleware
- #98 Nuntius client (reminder shadow write)

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 0 |
| 2 | データスキーマ | B | 0 |
| 3 | SRE | B | 0 |

**評価基準:** A=ベストプラクティス準拠 / B=軽微改善 / C=改善必要 / D=即時対応
