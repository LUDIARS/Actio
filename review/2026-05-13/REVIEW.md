# Actio コードレビュー総括 (2026-05-13)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio (旧 Schedula) |
| 対象ブランチ / PR | main (HEAD = `cbcb692`) |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 直近 50 commit (`cbcb692`..`09a542b` 周辺。 SDK Phase 1 + Placement + Push + Cernere 移行) |
| Tracked files | 429 |
| ソース構造 | `src/` (Hono バックエンド) + `frontend/` (React 19) + `modules/` (機能モジュール) + `packages/sdk` |

---

## 16 観点総合評価表

| # | レビュー観点 | 評価 | 重大指摘数 | 主要所見 |
|---|------------|------|-----------|---------|
| D1 | 設計強度 | B | 0 | 縮退動作 (Cernere 未接続時のプレースホルダ) ・ requestId middleware・readiness/liveness 分離が揃う。 webhook fire-and-forget のリトライがない |
| D2 | 設計思想の一貫性 | B | 1 | repository 経由 / `any` 禁止 / Cernere 個人データ単一情報源は守られている。 ただし `placement/repo.ts` の `remove()` が rowsAffected を見ずに常に `true` を返すなどローカル例外あり |
| D3 | モジュール分割度 | A | 0 | SDK + `defineModule()` で plugin 化進行、 placement / push / setup などモジュール境界が明瞭 |
| V1 | 脆弱性 | C | 2 | placement `/locations` の service key が無設定だと無認証で受信、 `fireHook` の URL バリデーションが SSRF (RFC1918 / link-local) を許容、 `userContext()` の `name`/`email` を JWT payload 直信頼 |
| V2 | ゼロトラスト | C | 1 | サービス間は service key 1 本 (有効期限なし) 。 Cernere project-token (per-user × per-project) への移行が未着手。 mTLS なし |
| V3 | セキュリティ | B | 1 | CSP / HSTS / nosniff / X-Frame-Options を `app.ts` に集約。 Rate limit は `/api/setup/*` のみ。 secret は Infisical 経由で良好 |
| I1 | コード品質 | B | 0 | `noImplicitAny` 強制、構造化ログ、 早期 return、 `console.log` トレースが過剰気味 (`composite.ts` の `[trace:cernere-exchange]` がプロダクションでも出る) |
| I2 | データスキーマ | B | 0 | Drizzle で sqlite/pg/mysql 互換、 `places` / `place_hooks` / `placement_state` / `place_visits` が新規追加。 個人データ legacy カラム残置あり (DROP COLUMN 禁止ルール) |
| I3 | SRE | B | 0 | `/api/health/live` (liveness) と `/api/ready` (DB+Redis) 分離。 構造化アクセスログ。 メトリクス (Prometheus 等) なし、 ランブック未整備 |
| M1 | 機能改善 | B | 0 | placement の `findCurrentPlace` 線形探索 (1 ユーザに数百 place を想定しないので OK)。 webhook リトライキューが欲しい |
| M2 | 不足機能 | B | 0 | placement hook の action_type は `webhook` のみ。 task / notify 拡張 + audit log が欲しい |
| Q1 | テスト戦略 | B | 0 | 22 テストファイル (api/* + placement-engine + plugin-* + service-adapter)。 unit + integration あり、 E2E なし、 カバレッジ計測なし |
| Q2 | パフォーマンス | C | 0 | ベンチマーク無し、 SLO 文書なし、 `vitest bench` 未導入 |
| Q3 | ライセンス | B | 0 | MIT 明記、 `LICENSE` あり、 依存も MIT/Apache 系。 NOTICE / THIRD_PARTY_LICENSES は未生成 |
| Q4 | クロスプラットフォーム互換 | B | 0 | Node.js v22+ 前提、 ESM、 Docker 公式ベースイメージ。 path.join 等の OS 差吸収は OK。 Windows / macOS / Linux CI matrix は未設定 (Linux のみ) |
| Q5 | ドキュメント | B | 0 | README / CLAUDE / DESIGN-facility-booking + `spec/` 配下 100+ md。 一部 spec が旧名 (Schedula) 残置、 API リファレンス自動生成なし |

**判定基準:** A=ベストプラクティス準拠 / B=軽微な改善点 / C=リリース前に対応推奨 / D=即時対応

---

## 重大指摘 (Critical / High) サマリ

| ID | 重大度 | 観点 | 該当箇所 | 概要 |
|----|--------|------|---------|------|
| V1-01 | High | 脆弱性 (V1) | `modules/placement/routes.ts:29-34` | `PLACEMENT_SERVICE_KEY` が未設定/空のとき認証チェックを完全にスキップして body の `user_id` を信頼。 GPS 偽装で他人の placement_state を上書きできる |
| V1-02 | High | 脆弱性 (V1) | `modules/placement/forwarder.ts:30-54` | webhook URL の SSRF 検証 (10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7) なし。 enter/leave で任意の内部サービスへ POST 可能 |
| V1-03 | Medium-High | 脆弱性 (V1) | `src/middleware/auth.ts:58-66` | JWT payload の `name` / `email` / `role` をそのまま `c.set("user")` に格納し下流に流す (CLAUDE.md は legacy フィールド禁止と書いてあるのにここを通る) |
| V2-01 | Medium | ゼロトラスト | `modules/placement/routes.ts:29` | service key 1 本で長期。 per-user × per-project token (Cernere `/api/auth/project-token`) への移行が未着手 |
| V3-01 | Medium | セキュリティ | `src/app.ts:62-68` | rate limit が `/api/setup/*` だけ。 placement `/locations` のような ingestion endpoint には未設定 |
| D2-01 | Low-Medium | 一貫性 | `modules/placement/repo.ts:88-96` | `placeRepo.remove()` が rowsAffected を見ず常に `true`。 削除失敗 (例: 別ユーザの id) が呼び出し側に検出できない |

**Critical=0 / High=2 / Medium=3 / Low=1**

---

## 重み付き総合スコア (weighted_score)

| 観点群 | 重み | 評価平均 |
|--------|------|----------|
| 設計 (D1-D3) | 0.25 | B+ |
| 脆弱性 (V1-V3) | 0.30 | C+ (V1 が C なため pull down) |
| 実装 (I1-I3) | 0.25 | B |
| 不足機能 (M1-M2) | 0.10 | B |
| 品質保証 (Q1-Q5) | 0.10 | B- |

**weighted_score: B-**

セキュリティ (placement ingestion + SSRF) が main blocker。 そこを潰せば B+ になるポテンシャル。

---

## 推奨アクション (今日は AUTOFIX 適用なし、 提案のみ)

1. `PLACEMENT_SERVICE_KEY` 未設定時は `/api/placement/locations` を 503 で塞ぐ (fail-closed)
2. `forwarder.fireHook` の URL に SSRF allowlist / private CIDR ブロック追加
3. `userContext()` から `name`/`email` を排除し、 必要時は `getUserInfo()` 経由で Cernere から取得 (CLAUDE.md ルール厳格化)
4. `placeRepo.remove()` の戻り値を rowsAffected ベースに修正 (`db.delete().returning()` or `findById` 再確認)
5. `[trace:cernere-exchange]` の `console.log` を `secretManager.get("DEBUG_AUTH")` ガード下に
6. `vitest bench` を 1 つでも入れて SLO 計測の足場を作る

詳細は `REVIEW_DESIGN.md` / `REVIEW_VULNERABILITY.md` / `REVIEW_IMPLEMENTATION.md` / `REVIEW_MISSING_FEATURES.md` / `REVIEW_QUALITY.md` を参照。 修正候補一覧は `AUTOFIX.md`。
