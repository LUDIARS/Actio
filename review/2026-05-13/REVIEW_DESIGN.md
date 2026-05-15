# 設計レビュー (Design Review) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | main (HEAD `cbcb692`) |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 直近 50 commit (SDK Phase 1 + Placement + Push + Cernere Composite) |

---

## 1. 設計強度 (Design Robustness)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 障害分離 | `service-adapter` 起動失敗をログのみで握り潰し user-facing API は継続 (`src/index.ts:34-36`)。 Cernere 未接続時は `getUserInfo` がプレースホルダ (`user-${id.slice(0,8)}`) を返す縮退設計。 SDK module 静的インストールは Promise を await せず構築 (`src/app.ts:187-214`) で、 manifest reject はログのみ |
| B | 冪等性 | `placementStateRepo.upsert()` は existing チェックで分岐 (`modules/placement/repo.ts:116-145`)。 同 ts 重複 POST でも transition は `diffTransitions` で安全。 ただし webhook 発火は冪等鍵なしで same transition が複数回飛ぶ可能性あり |
| B | 入力バリデーション | `placement/routes.ts:50-60` で `user_id / lat / lon / ts` を型 + isNaN チェック。 hook POST も `event` enum を検証。 しかし `radius_m` は `Math.max(1, ... | 0)` で負値や 1e9 を許容、 `lat/lon` 範囲 (±90 / ±180) チェックなし |
| B | エラーハンドリング | `app.onError()` で全例外を JSON 化 (`src/app.ts:53-60`)、 本番はスタック非露出。 構造化アクセスログ (`src/app.ts:76-99`) が status>=400 を `[http-warn]`、 >=500 を `[http-error]` で出す |
| C | リトライ・タイムアウト設計 | `forwarder.fireHook` は `AbortSignal.timeout(5000)` で 5s timeout のみ、 失敗時のリトライ無し fire-and-forget (`modules/placement/forwarder.ts:53`)。 Cernere exchange も timeout 設定なし (`src/auth/composite.ts:55-66`) |
| B | 状態管理の明確性 | placement の `placement_state` (現在位置 1 行/user) + `place_visits` (履歴) で in-flight / archived を分離。 Plugin registry は `enabledModules` cache + global/group/user scope で多層 |

### チェック項目

- [x] 単一障害点なし: Cernere DOWN でも縮退、 Redis なくても sessionCache fallback、 Nuntius 経由 push も shadow write
- [ ] 外部サービス障害時の縮退: webhook 失敗時のリトライキュー不在
- [ ] 入力境界値: `lat/lon` 範囲 / `radius_m` 上限 / `accuracy` の sanity check が無い
- [x] fail-safe: app.onError + http-warn/error ログ
- [ ] 非同期 timeout: fetch (Cernere exchange / Nuntius) に timeout 不在のものあり
- [x] race: `placement_state` upsert は user 単位で隔離 (transactional ではないが key 単一)

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| `modules/placement/repo.ts:88-96` | `placeRepo.remove()` が rowsAffected を見ず常に true 返却 | リポジトリ層は方言差を吸収し、 削除失敗を呼び出し側に伝える責務 | `db.delete(...).returning({ id })` (pg/sqlite で動く) or 削除前 `findById` で確認 |
| `src/middleware/auth.ts:58-66` | JWT payload の `name` / `email` / `role` をセッションに焼き込み (個人データ単一情報源ルールに矛盾) | CLAUDE.md「個人データは Cernere」 | `getUserInfo()` 経由で Cernere から取得、 session には id + role のみ |
| `src/auth/composite.ts:52-73` | `[trace:cernere-exchange]` の console.log が常時出力 | 本番ログには出さない (auth_code 部分露出も) | `DEBUG_AUTH` flag or pino level guard |
| `modules/placement/routes.ts:29-34` | `expected` が空文字なら認証チェック自体をスキップする「フェイルオープン」設計 | ingestion endpoint は fail-closed であるべき | `if (!expected) return 503` (未設定なら拒否) |
| `src/app.ts:187-214` | `installModule()` の Promise を await せず破棄 | manifest 登録失敗をログのみで握り潰す | Promise.allSettled で集約し、 reject を err log + reject 数の health 反映 |

### チェック項目

- [x] レイヤー依存: routes → repository → drizzle の単方向、 placement も同様
- [x] 命名: camelCase + kebab-case ディレクトリ、 一貫
- [x] リポジトリパターン: CLAUDE.md ルール厳守 (`.all()`/`.run()`/`.get()` の SQLite 固有メソッド使用なし)
- [ ] 再実装: `crypto.createHmac` で JWT 自前署名 (`composite.ts:106-109`)。 `jsonwebtoken` を既に import 済みなのに使わない (依存重複)
- [x] 責務配置: SDK は `packages/sdk`、 plugin host は `src/plugins/`、 module は `modules/`
- [x] ハードコーディング: ほぼ全部 `secretManager.get/getOrDefault` 経由

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

| モジュール / クラス | 凝集度評価 | 所見 |
|-------------------|-----------|------|
| `modules/placement/` (engine/forwarder/repo/routes) | 機能的 | 4 ファイルが GPS → place 判定 → state → hook の 1 責務に集中。 `engine.ts` は pure (DB なし) でテスト容易 (`tests/placement-engine.test.ts` 既存) |
| `src/plugins/` (loader/registry/context/admin-routes) | 機能的 | plugin lifecycle の単一責務、 SDK と host の境界明瞭 |
| `src/app.ts` (390 行) | 手続き的 → 機能的の境界 | createApp() が middleware → route → plugin install → health まで線形に並べる。 plugin install 7 個が手書きループでないのは冗長 (改善余地あり) |
| `src/db/repository.ts` | 機能的 (テーブル別) | テーブルごとに `xxxRepo` を切り出し、 共通 helper も同居 |
| `src/middleware/auth.ts` | 機能的 | userContext + requireRole の 2 関数、 副作用は `c.set` のみ |

### チェック項目

- [x] SRP: placement の 4 ファイルは明確に責務分離
- [x] God class なし
- [x] 結合度: SDK 経由で plugin → host の依存方向が単方向
- [x] 循環依存なし (`modules/*` は `src/*` を import するが逆は無し)
- [x] ISP: `placeRepo` / `placeHookRepo` / `placementStateRepo` / `placeVisitRepo` で粒度小さく分離
- [x] ディレクトリ構成: `core/` (Event/Task) と `modules/` (機能拡張) で AIFormat 想定通り

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | B | 0 |
| 2 | 設計思想の一貫性 | B | 1 (V1-03 と重複: JWT payload 個人データ焼き込み) |
| 3 | モジュール分割度 | A | 0 |

**評価基準:** A=ベストプラクティス準拠 / B=軽微な改善点 / C=改善必要 / D=重大問題
