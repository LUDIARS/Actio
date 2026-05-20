# AUTOFIX 候補一覧 — Actio (2026-05-13)

> 本セッションでは **autofix の自動適用はスキップ** (autofix_count = 0)。
> 以下は手動レビュー後に PR 化を検討する候補のみ列挙する。

## 修正対象なし (自動適用ゼロ)

今日のレビュー (`/ludiars-review`) では以下の方針により、 review 文書生成のみを行い、 ソースコードへの修正・PR 作成はスキップ。

- **方針**: ユーザ依頼の対象が `review/2026-05-13/` 配下の 8 ファイル生成のみで、 ソース修正は明示的に「今日はスキップ」と指示されているため。
- **修正可能だが今日は適用しない理由**:
  - 高重大度指摘 (V1-01 placement 認証 fail-open / V1-02 SSRF) は **設計判断を要する** (fail-closed にした場合 Iv 側の運用ドキュメント更新が必要、 SSRF allowlist は外部 webhook 仕様にも影響)。 単独 PR で安全に修正できない。
  - 軽微修正 (`[trace:cernere-exchange]` の log ガード、 `radius_m` の上限) も、 単独 PR より V1 修正と束ねた方が CI 通過の効率が良い。

---

## 修正候補リスト (将来 PR 化)

### S (Safe) - 文言・コメント・lint レベル

| ID | 該当箇所 | 内容 | 工数 |
|----|---------|------|------|
| S-01 | `README.md:94-96` | `cd Schedula` → `cd Actio` (PR #108 でリネーム済みなのに案内残置) | 5min |
| S-02 | `src/auth/composite.ts:52,60,65,73` | `[trace:cernere-exchange]` を `if (secretManager.get("DEBUG_AUTH"))` ガード | 10min |
| S-03 | `modules/placement/forwarder.ts:33` | `5000` を `WEBHOOK_TIMEOUT_MS` 定数化 (top of file) | 5min |
| S-04 | `modules/placement/routes.ts:165` | `radius_m` に上限 100_000m を設定 | 5min |
| S-05 | `MODULES.md` | 廃止済 machina / reminder の section を archived としてマーク | 10min |

### M (Medium) - ロジック修正、 既存テストでカバー可能

| ID | 該当箇所 | 内容 | 工数 |
|----|---------|------|------|
| M-01 | `modules/placement/repo.ts:88-96` | `placeRepo.remove()` を `.returning({ id })` で件数判定する形に修正 | 20min |
| M-02 | `modules/placement/routes.ts:50-60` | lat/lon 範囲チェック (`Math.abs(lat) > 90` 等) を追加、 `placement-engine.test.ts` に境界値テスト追加 | 30min |
| M-03 | `src/auth/composite.ts:86-112` | 自前 HMAC を `jwt.sign()` に置換 | 30min |
| M-04 | `src/app.ts:187-214` | installModule 7 個を `Promise.allSettled` でループ化、 reject は集約ログ | 30min |
| M-05 | `src/middleware/auth.ts:46-66` | session に焼き込むフィールドを `id` + `role` のみに限定、 name/email は `getUserInfo()` に委譲 | 60min (関連箇所 grep 必要) |

### H (Heavy) - 設計議論を要する、 単独 PR 推奨

| ID | 該当箇所 | 内容 | 工数 |
|----|---------|------|------|
| H-01 | `modules/placement/routes.ts:29-34` | service key 未設定時に fail-closed (503)。 Iv 側の運用 doc 更新も必要 | 1d |
| H-02 | `modules/placement/forwarder.ts:29-54` | webhook URL に SSRF allowlist + DNS-rebind 対策。 `safeFetch` ヘルパー化を伴う | 1d |
| H-03 | placement /locations → per-user × per-project token | Cernere `/api/auth/project-token` (memory: feedback_secret_per_user_memory_only) 経由に置換 | 2d (Iv 改修込み) |
| H-04 | webhook リトライキュー + `place_hook_logs` audit テーブル | schema + repo + 配送 worker | 2d |
| H-05 | E2E smoke test (Playwright) を `tests/e2e/` に追加 | login → event 作成 → task 完了の 1 フロー | 1d |

---

## カテゴリ別サマリ (latest.json `autofix_categories` 用)

| カテゴリ | 候補数 | 自動適用数 |
|---------|--------|-----------|
| security | 4 (V1-01, V1-02, V1-03, V3-01) | 0 |
| reliability | 3 (webhook retry, lat/lon validation, installModule allSettled) | 0 |
| docs | 2 (README cd, MODULES archive) | 0 |
| lint / cleanup | 3 (log gate, magic number, jwt unify) | 0 |
| schema | 1 (placeRepo.remove returning) | 0 |
| performance | 1 (placement bbox filter) | 0 |
| testing | 2 (E2E, coverage report) | 0 |

合計候補: 16 / 自動適用: 0

---

## 次回 PR 化の推奨順

1. **S 群を 1 PR**: 5 件の文言/lint 修正をまとめる (CI 1 回で済む)
2. **M-01, M-02 を 1 PR**: placement 入力検証強化
3. **H-01 + H-02 を 1 PR**: placement security ハードニング (本 review の High 2 件を解消)
4. **M-05 単独 PR**: session の個人データ除外 (関連 grep が広いため)
5. **H-04 を 1 PR**: webhook retry + audit
6. **H-03 を別 sprint**: Iv 側改修と歩調合わせ

**今日 (2026-05-13) 適用件数: 0**
