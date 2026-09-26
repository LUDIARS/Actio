---
title: "ローカルモードで Cloudflare Access 認証付きトンネルを通す"
status: implemented
owner: Actio
related:
  - spec/feature/local-auth-mode.md
  - spec/feature/team-task/spec.md
  - spec/tasks/2026-09-26-local-owner-team-role.md
  - Excubitor spec/feature/cf-tunnel-routes.md
decided_by: neco (2026-09-15 指示「ローカルモードの場合、認証付きの CF トンネルは通すようにしてほしい」)
---

# ローカルモードで Cloudflare Access 認証付きトンネルを通す

`local-auth-mode.md` のローカルモードは、ループバックからの直接アクセスだけを通し、Cloudflare 系ヘッダー付きの要求は一律 403 にしている。
本書は、**Cloudflare Access で認証済みの要求に限って**、Cloudflare Tunnel 経由のアクセスも通す設計。

## 0. 原則

1. **認証の根拠は署名付きアサーションだけ。** `Cf-Access-Jwt-Assertion` の JWT を Actio 自身が検証する。
   `Cf-Access-Authenticated-User-Email` など署名の無いヘッダーは使わない。
2. **待ち受けはループバックのまま。** backend / Vite は引き続き `127.0.0.1` だけで待ち受ける。外から届くのは
   同じ PC の cloudflared 経由だけで、LAN から直接ヘッダーを偽装しても届かない。
3. **設定が欠けたら起動しない。** Cloudflare を有効にしたのに Access の検証設定が揃っていなければ、起動時にエラーにする (無言で素通し・拒否に倒さない)。
4. **Actio はトンネルを持たない。** cloudflared とルート設定は既存の共有トンネル (Excubitor の cf-tunnel ブローカー) が持つ。`TUNNEL_TOKEN` は引き続き拒否する。

## 1. 設定 (ACTIO_LOCAL_MODE=1 のとき)

| 変数 | 必須 | 説明 |
|---|---|---|
| `ACTIO_CLOUDFLARE_ENABLED` | | `1` で Access 経由を許可。未設定 / `0` は従来どおり Cloudflare 系要求を 403 |
| `ACTIO_CF_ACCESS_TEAM_DOMAIN` | `1` のとき | 例 `ludiars.cloudflareaccess.com`。証明書 URL と `iss` の検証に使う |
| `ACTIO_CF_ACCESS_AUD` | | Access アプリケーションの AUD タグ (カンマ区切り複数可)。設定したときだけ `aud` を照合する |
| `ACTIO_CF_PUBLIC_ORIGIN` | `1` のとき | 公開 URL (例 `https://actio.example.com`)。Host / Origin の照合と Vite の許可ホストに使う |

- `ACTIO_PUBLIC_URL` / `FRONTEND_URL` は従来どおりループバック限定 (Excubitor の provides)。公開 URL は `ACTIO_CF_PUBLIC_ORIGIN` に分ける。
- 秘密値は無い (AUD・team domain は公開情報)。catalog の `env:` に置いてよい。

## 2. 要求の判定 (`src/auth/local-access-policy.ts`)

`isLocalModeRequest` を、アクセス経路を返す `resolveLocalAccess` に置き換える。

| 経路 | 条件 (すべて満たす) |
|---|---|
| `loopback` (従来) | ループバックのソケット、ループバックの URL / Host / Origin、Cloudflare・転送ヘッダー無し、same-origin |
| `cf-access` (新規) | `ACTIO_CLOUDFLARE_ENABLED=1`、ループバックのソケット (cloudflared)、Host が `ACTIO_CF_PUBLIC_ORIGIN` のホスト、Origin があれば公開 origin と一致、`sec-fetch-site` が same-origin / none、`Cf-Access-Jwt-Assertion` が §3 の検証に通る |

どちらにも当たらない要求は従来どおり 403 (`local_access_required`)。REST の認証 middleware、`/api/auth/*`、WebSocket upgrade の 3 か所が同じ判定を使う。

## 3. アサーションの検証 (`src/auth/cf-access-verify.ts`)

- 署名: RS256。公開鍵は `https://<team domain>/cdn-cgi/access/certs` の JWKS。起動後に取得してキャッシュし、未知の `kid` が来たら 1 回だけ再取得する (連続再取得は間隔を空ける)。
- `iss` = `https://<team domain>`、`exp` / `nbf` (時計ずれ 60 秒まで)。`ACTIO_CF_ACCESS_AUD` を設定したときだけ `aud` を照合する。
- **誰を通すかは Cloudflare Access のポリシーで決める** (neco 2026-09-15「CF の Access で制御するので通ったら OK」)。Actio は email で絞らない。
  署名と team domain の検証は残す: Access の掛かっていない hostname がトンネルに向いた場合、利用者が自分で付けた偽のヘッダーを通さないため。
- `email` は監査ログ用に読むだけ (無ければ null)。`sub` は使わない (Cloudflare 側で変わりうる)。
- 証明書が取れないときは検証失敗 (403)。無検証で通さない。
- 検証は依存注入 (JWKS 取得・時計) で純粋に試験できる形にする。

## 4. 識別子

- Access 経由の要求も、ローカルモードの固定ユーザー `actio-local` (role `general`) として扱う。ローカルモードは「この PC の持ち主 1 人」のための配備で、ユーザーを増やさない。
- 検証済み email は監査ログ (アクセスログの `via=cf-access`) にだけ残し、DB には保存しない。
- `/api/auth/me` は `localMode: true` に加えて `access: "loopback" | "cf-access"` を返す。

### 4.1 持ち主のチーム権限

neco 2026-09-26 指示「Actio のチームに既存のチームを登録しよう」による。持ち主 (`actio-local`) はどのチームの
`team_members` にも居ないため、Cc 同期済みのチームがあっても一覧が空になり、計画もできなかった。
ローカルモードは持ち主 1 人の配備なので、持ち主を全チームの leader 相当として扱う (`src/auth/local-owner.ts`)。

| 対象 | 持ち主の扱い |
|---|---|
| Cc 同期で `team_refs` にあるチーム | `team_members` に行が無くても leader 相当。`requireTeamRole` は `teamRole=leader`、`actingUserId=actio-local` で通す |
| `team_refs` に無い teamId | 従来どおり 403 |
| `GET /api/teams` | `team_refs` の全件を role `leader` で返す |
| メンバー/ロール変更 (`PUT/DELETE /api/teams/:teamId/members/:userId`) | admin 相当として許す (持ち主以外のユーザーは居ないので実害は無い) |

- **判定の根拠は経路だけ。** 境界 middleware が確定した経路 (loopback / §3 の検証を通った cf-access) で、かつ userId が `actio-local` の要求を持ち主とする。legacy の `users.role` や DB の membership は読まない。持ち主のロールは DB に保存せず、要求ごとに経路から決める。
- **公開配備 (ローカルモード無効) では一切適用されない。** 経路が決まらないので、`actio-local` を名乗るトークンでも持ち主にはならない。
- Cc service 経路 (api_client + `X-Decided-By`) は対象外で、従来どおり `team_members` で判定する。
- admin のバイパス (`userRole=admin`) とは別枠。持ち主のロールは `general` のままで、チーム以外の admin 機能は開かない。

## 5. Vite (actio-web)

- ローカルモードでも `ACTIO_CF_PUBLIC_ORIGIN` のホストを `allowedHosts` に加える。
- backend への proxy は Host と Cloudflare ヘッダーを保ったまま転送する (既存の `changeOrigin: false`)。

## 6. 公開の手順 (人間 / 共有インフラ側)

1. Cloudflare Zero Trust で Access アプリケーションを作る (公開 hostname、許可ポリシー)。AUD を控える。
2. Excubitor の cf-tunnel ブローカーで `hostname → http://127.0.0.1:17881` のルートを追加する (hostname を allowlist に入れる)。
3. Actio の catalog の `env:` に §1 の値を入れ、Excubitor 経由で `actio` / `actio-web` を再起動する。

## 7. テスト

- 判定: loopback / cf-access の各条件の欠落、Host・Origin の不一致、転送ヘッダーだけの偽装。
- 検証: 正しい署名、別の鍵、`aud` / `iss` 違い、期限切れ、許可外 email、未知 `kid` の再取得、証明書取得失敗。
- 設定: `ACTIO_CLOUDFLARE_ENABLED=1` で必須値が欠けたら起動エラー、`TUNNEL_TOKEN` は引き続き拒否。
- REST / WS: 有効なアサーション付きの要求が `actio-local` として通り、無いものは 403。
- 持ち主 (§4.1): 判定の純関数 (loopback / cf-access / ローカルモード無効 / 別ユーザー / `team_refs` に無いチーム)、
  ローカル経路での `GET /api/teams` 全件 leader・計画 API の通過・未知 teamId の 403・メンバー変更、
  ローカルモード無効時に `actio-local` を名乗るトークンが従来どおり拒否されること。

## 8. 未決 (人間の判断待ち)

- 公開 hostname (例 `actio.<domain>`)。
- Cloudflare Access アプリの team domain / AUD と許可 email (作成は Cloudflare 側の作業)。
- Access 経由のユーザーを `actio-local` 1 人に寄せるか (本書の案)、email ごとに Actio ユーザーを分けるか。
