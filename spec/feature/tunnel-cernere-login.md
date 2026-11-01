---
title: "ローカルモードのトンネル経由は Cernere ログインで識別する"
status: implemented
owner: Actio
related:
  - spec/feature/local-mode-cf-access.md
  - spec/feature/task-visibility.md
decided_by: neco (2026-10-31「CF はアクセスログだけ取って Cr で運用しよう。Cr は登録許可制にします」、2026-11-01 案A「入口で分ける」)
---

# ローカルモードのトンネル経由は Cernere ログインで識別する (AT-TUNNEL-LOGIN)

## 1. 目的

本社と MELPOT が同じ Actio で Ludellus のスプリントを共有する。トンネル (Cloudflare) 経由の利用者を
Cernere のアカウントで見分け、チームでアクセス範囲を分ける (`task-visibility.md`)。

`local-mode-cf-access.md` では Access を通った人を全員この PC の持ち主 (`actio-local`) として扱っていた。
本書の設定を入れると、入口で次のように分ける。

| 入口 | 扱い |
|---|---|
| この PC から直接 (loopback。Concordia の同期を含む) | 従来どおり持ち主 `actio-local` |
| トンネル経由 (公開 hostname) | 持ち主にしない。Cernere ログイン (Composite) のユーザーとして扱う。未ログインは匿名 (401) |
| どちらでもない | 従来どおり 403 (`local_access_required`) |

持ち主の作ったタスクは移し替えない (DB を書き換えない)。トンネル経由の利用者は、自分の作ったもの・担当・所属チームのものを見る。

## 2. 設定

| 変数 | 値 | 説明 |
|---|---|---|
| `ACTIO_TUNNEL_AUTH` | `cf-access` (既定) / `cernere` | `ACTIO_CLOUDFLARE_ENABLED=1` のときだけ意味を持つ。それ以外の値は起動エラー |

`cernere` のとき、次が揃っていなければ起動エラーにする (無言でログイン不能にしない)。

- `JWT_SECRET` (Actio が発行する service token の署名。Vault)
- `CERNERE_URL` (authCode の交換先。Excubitor の provides)

ログイン画面 (popup) の URL は `CERNERE_FRONTEND_URL` (Excubitor の provides、利用者の端末から届く公開 URL) を優先し、
無ければ従来どおり `CERNERE_URL` を使う。

## 3. 要求の判定

`cernere` のとき、境界 middleware (`localModeBoundary`) は次の順で判定する。

1. loopback の条件 (`allowsLocalRequest`) を満たす → 経路 `loopback` (持ち主)。
2. トンネルの形 (`isTunnelRequest`: ループバックのソケット、Host が公開 hostname、Origin があれば公開 origin、same-origin の fetch) を満たす →
   経路を付けずに通す。以降は通常の認証 (`userContext`: Cernere の PASETO / Actio の service token) が利用者を決める。
3. それ以外 → 403。

- `Cf-Access-Jwt-Assertion` があれば署名を検証し、通ったら email を監査ログ (`[tunnel-access]`) に 1 プロセス 1 回だけ出す。
  検証は応答を待たせない (結果を待たずに次へ進む)。無くても、検証に失敗しても通す (識別は Cernere が担う)。DB には保存しない。
- `/api/auth/me` はトンネル経由では `localMode` を返さない。未ログインなら 401 で、画面は Cernere のログインに切り替わる (画面の変更は無い)。
- WebSocket もトンネル経由では token (`/api/auth/ws-token` が Cookie から返す) を要求する。
- `cf-access` (既定) のときは従来どおり (`local-mode-cf-access.md` §2)。

## 4. 登録の許可

Cernere は許可制 (許可待ち・停止中のユーザーには authCode を出さない)。Actio 側で追加の許可は持たない。
Cernere の `CERNERE_COMPOSITE_ALLOWED_ORIGINS` に公開 origin (`https://actio.ai-run-do.com`) が入っていないと、
ログインの authCode が Actio に戻らない (Cernere 側の設定、別 PR)。

## 5. 切り替えの手順 (別作業)

1. Cernere の許可 origin に公開 origin を足して反映する。
2. Vault の actio に `JWT_SECRET` を登録する (人間)。
3. Actio の catalog の `env:` に `ACTIO_TUNNEL_AUTH: cernere` を入れ、Excubitor 経由で `actio` を再起動する。
4. Cloudflare Access のポリシーを「全員通過 + ログ」に変える (neco)。
5. Ludellus のチームに本社 / MELPOT のメンバーを登録する。

## 6. 実装

- 設定と判定 (純関数): `src/auth/local-mode-policy.ts` (`readTunnelAuth` / `isTunnelRequest`)
- 境界と監査: `src/auth/local-mode.ts` (`localModeBoundary` / `tunnelRequiresLogin`)
- 起動時の必須値: `src/index.ts`、ログイン URL: `src/auth/composite.ts`
- テスト: `tests/unit/local-mode-tunnel-login.test.ts`
