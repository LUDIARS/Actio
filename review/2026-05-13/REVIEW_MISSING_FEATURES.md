# 不足機能評価 (Missing Feature Evaluation) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | main (HEAD `cbcb692`) |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 直近 50 commit |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| `modules/placement/forwarder.ts` webhook | リトライキュー (指数バックオフ、 max 3 回) + dead-letter テーブル | enter/leave で 1 度きりの fire-and-forget だと一時的なネットワーク障害で永久に欠落。 リトライキューで配信信頼性向上 | High |
| `modules/placement/routes.ts` /locations | ingestion レイヤに rate limit (per service key, 1 req/sec/user) | GPS が誤って 10Hz で送信されても DB write を抑制、 hook 連打を防止 | High |
| `src/auth/composite.ts` exchange | `fetch` に `AbortSignal.timeout(5000)` 追加 + Cernere 4xx/5xx 別ハンドリング | Cernere 障害時にバックエンドが exchange の応答待ちでハング | Medium |
| `placement/findCurrentPlace` | 1 ユーザの place 数が増えたとき (>50) 用に bbox 事前 filter (lat ± dr/111000, lon ± dr/(111000*cos(lat))) | 線形探索の前段で 90% 削減、 100 place でも O(残り N×haversine) で済む | Low (現状 OK) |
| `src/middleware/auth.ts` JWT decode | zod / valibot で payload schema 検証 | `as` キャストの安全性向上、 改ざん検知 | Medium |
| `src/app.ts:187-214` installModule | for-of loop に集約 + `Promise.allSettled` で並列待ち合わせ | 7 行コピペが 1 つの map に圧縮、 ログも一元化 | Low |
| Activity log (`activity-logger.ts`) | 起動時 in-memory 100 件しか保持しない設計。 DB バックアップ + 検索 UI | 監査要件に向かない、 障害再現が困難 | Medium |
| 全ての outbound fetch (forwarder / composite / nuntius-client) | 共通の `safeFetch(url, opts)` ラッパー (timeout + SSRF block + UA + retry policy) | コピペ防止、 SSRF を 1 箇所で対策可 | High |

### 観点

- パフォーマンス: 大半は B 評価で問題なし。 placement の bbox filter は将来的余地のみ
- ユーザ体験: webhook retry 不在は UX に直結 (enter で task 作成が落ちると気付かない)
- テスタビリティ: `engine.ts` は pure で OK、 `forwarder.ts` は fetch 直叩きで mock 困難 → DI 化提案
- 運用負荷: メトリクス + dashboard の整備で削減可能

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| placement hook の `action_type` 拡張 (`task` / `notify` / `event`) | 現状は webhook のみ。 「家に着いたら買い物 task を有効化」「学校 leave で帰宅 reminder」 などの自然な UX を実装可能に | High | `modules/placement/forwarder.ts` + `modules/task/`, `modules/notification/` |
| placement audit log (`place_hook_logs` テーブル) | 失敗が console.warn のみで残らない、 ユーザが「webhook 飛んだのか」を確認できない | High | schema + repo + admin page |
| Iv → Actio の per-user × per-project token (Cernere `/api/auth/project-token`) | service key 1 本の長期共有を解消、 ユーザ毎に revoke 可能 | High | placement /locations + Iv 側両方 |
| Prometheus / OTel メトリクス export | レイテンシ・エラー率・スループットが現状 stdout ログのみ。 Excubitor (新設可観測性) 連携前提 | Medium | `src/middleware/metrics.ts` 新設 |
| SLI/SLO 文書 + ランブック | DR / oncall 対応の前提情報が無い | Medium | docs/ |
| OpenAPI / 自動生成 API リファレンス | 現状 README + spec/ 手書き md。 Hono は openapi-zod 連携可能 | Medium | `@hono/zod-openapi` 導入 |
| E2E smoke test (Playwright or Cypress) | 主要フロー (ログイン → 予定作成 → タスク完了) を毎 PR で検証 | Medium | `tests/e2e/` 新設 |
| 依存スキャン CI (npm audit / Dependabot / GitHub CodeQL) | CVE 早期検知 | Medium | `.github/workflows/security.yml` 新設 |
| placement のジオフェンス mute window (時間帯/曜日) | 深夜の enter/leave で hook 暴発するのを抑制したいケースあり | Low | hook schema 拡張 |
| WebSocket broadcast の Redis pub/sub 化 | 単一プロセス前提 → 水平スケールで broadcast が分断 | Low (現状の規模では OK) | `src/ws/broadcast.ts` |
| Backup / Restore の自動化 (cron) | 手動 script のみ | Low | docker-compose に cron service |

### 観点

- 入力バリデーション不足: lat/lon 範囲、 radius_m 上限、 hook URL の private CIDR
- エラー通知・アラート欠如: webhook 失敗の永続化、 readiness 503 の Excubitor 通知
- 監査ログ不足: placement hook 履歴、 admin 操作の永続化
- ヘルスチェック: 既に分離済 (B)
- レート制限: ingestion endpoint で未実装
- バッチ・リトライ: webhook リトライ不在
- ドキュメント: API リファレンス自動生成なし、 ランブック無し

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 8 | High: 3 / Medium: 3 / Low: 2 |
| 2 | 不足機能 | 11 | High: 3 / Medium: 5 / Low: 3 |

**判定 (両方とも B 評価):** 設計上の重大欠落は無い。 個人 GPS を扱う placement 周辺の補強 (audit + retry + per-user token + SSRF block) が High 群の本丸。
