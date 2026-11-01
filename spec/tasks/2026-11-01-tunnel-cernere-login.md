---
project: Actio
kind: task
created: 2026-11-01
---

# トンネル経由は Cernere ログインで識別する (案A「入口で分ける」)

依頼: neco「CF はアクセスログだけ取って Cr で運用しよう。Cr は登録許可制」(2026-10-31)、
案A「入口で分ける」選択 (2026-11-01)、「残作業進めて」(2026-11-01)。

仕様: `spec/feature/tunnel-cernere-login.md`

## 受入条件

- [x] `ACTIO_TUNNEL_AUTH` (既定 `cf-access` / `cernere`)、不正値は起動エラー。
- [x] `cernere` のとき、トンネルの形の要求は持ち主にせず境界を通し、通常の認証で識別する。loopback は従来どおり持ち主。
- [x] Access のアサーションは監査ログ用 (応答を待たせない、失敗でも通す)。
- [x] `cernere` のとき `JWT_SECRET` / `CERNERE_URL` が欠けたら起動エラー。
- [x] ログイン URL は `CERNERE_FRONTEND_URL` を優先。

## 後続 (別手順)

- Cernere の `CERNERE_COMPOSITE_ALLOWED_ORIGINS` に `https://actio.ai-run-do.com` を追加・反映 (Cernere PR)
- Vault の actio に `JWT_SECRET` (人間)
- catalog `ACTIO_TUNNEL_AUTH: cernere` と Actio の再起動
- Cloudflare Access のポリシー変更 (neco)、Ludellus チームのメンバー登録
- Cc の指示者記録 (パターン2)
