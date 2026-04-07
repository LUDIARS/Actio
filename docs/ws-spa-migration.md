# Schedula WS セッション対応 SPA 移行設計書

## 1. 背景と目的

### 1.1 現状

Cernere を SPA 化し、WebSocket 常時接続セッション（Always-Connected Session）を導入した。
これにより認証済みセッションの継続検証、破壊的操作の遮断、リアルタイム通信が可能になった。

Schedula は既に React 19 + React Router 7 の SPA 構成だが、
通信は **HTTP REST のみ** であり、Cernere の WS セッション基盤を活用していない。

### 1.2 課題

| # | 課題 | 影響 |
|---|------|------|
| 1 | HTTP REST のみで WS セッションを使っていない | Cernere の認証設計原則（常時接続セッション）に準拠していない |
| 2 | 破壊的操作が Bearer トークンのみで実行可能 | トークン窃取時のリスクが高い |
| 3 | リアルタイム通知手段がない | Webhook/通知の即時配信、グループ間の同期ができない |
| 4 | Vite proxy が `backend:3000` 固定 | 開発時のみ Docker 依存、単体起動しづらい |

### 1.3 目標

Cernere と同等の WS セッション対応 SPA 構成に移行し、以下を実現する:

1. **破壊的操作は WS セッション経由のみ** — フロントエンド REST API ではなく Schedula バックエンドとの WS で実行
2. **Cernere とのセッション一本化** — service-adapter でセッションライフサイクルを統合（admission/revoke）
3. **id-cache 3 点認証の活用** — 既存の本人保証を WS 接続時にも適用（独自認証は不要）
4. **リアルタイム通信基盤** — サーバープッシュ通知、グループイベント同期
5. **REST API との併用** — 読み取り操作は引き続き REST（変更なし）

---

## 2. 現状整理

### 2.1 Cernere SPA アーキテクチャ（参照実装）

```
frontend/
├── src/
│   ├── App.tsx              # BrowserRouter + Routes (RequireAuth ラッパー)
│   ├── contexts/
│   │   └── AuthContext.tsx   # user + wsConnected 状態管理、WS 自動接続
│   ├── lib/
│   │   ├── api.ts           # REST API クライアント (認証・プロフィール等)
│   │   └── ws-client.ts     # CernereWsClient クラス (module_request/response)
│   ├── components/
│   │   └── AppLayout.tsx    # Header + Outlet (認証済みレイアウト)
│   └── pages/               # 5 ページ
```

**WS 通信パターン:**
- 接続: `ws(s)://<host>/auth?token=<jwt>` → `connected { session_id, user_state }`
- Ping/Pong: 30 秒間隔、10 秒タイムアウト
- コマンド: `module_request { module, action, payload }` → `module_response`
- リレー: `relay { target, payload }` → `relayed { from_session, payload }`

**AuthContext の WS 統合:**
- `user` がセットされたら `wsClient.connect(token)` を自動呼出
- `logout` 時に `wsClient.disconnect()`
- `wsConnected` フラグを Context で公開

### 2.2 Schedula 現在の構成

```
frontend/
├── src/
│   ├── App.tsx              # BrowserRouter + Routes (setup チェック付き)
│   ├── contexts/
│   │   └── AuthContext.tsx   # user 状態管理 (REST のみ、WS なし)
│   ├── lib/
│   │   ├── api.ts           # REST API クライアント (1629 行, 100+ エンドポイント)
│   │   ├── api-types.ts     # TypeScript 型定義
│   │   ├── module-registry.ts  # UI モジュールレジストリ
│   │   └── modules/         # モジュール定義 (メニュー、ルート、ブロック)
│   ├── components/
│   │   └── Layout.tsx       # サイドバー + Outlet
│   └── pages/               # 30+ ページ
```

**バックエンド:**
- Hono + Node.js (HTTP REST のみ)
- 認証: Cernere JWT 検証 (`@ludiars/cernere-id-cache` ミドルウェア)
- WS 接続: **なし**

**Id Service プラグイン:**
- `src/plugins/schedula.ts` — Cernere Id Service にプロフィールフィールドを登録
- サービス固有: `major`, `calendarAccessId`

### 2.3 差分サマリ

| 項目 | Cernere | Schedula (現状) | Schedula (目標) |
|------|---------|----------------|----------------|
| SPA フレームワーク | React 19 + Router 7 | React 19 + Router 7 | 変更なし |
| ユーザー認証 | JWT + WS セッション | JWT のみ (REST) | JWT + WS セッション |
| 本人保証 | Cernere 自身が認証局 | id-cache 3 点認証 | id-cache 3 点認証 (変更なし) |
| サービス↔Cernere 接続 | (自分自身) | なし | service-adapter (`/ws/service`) |
| セッション管理 | Redis (自前) | なし | Cernere 一本化 (admission/revoke) |
| WS クライアント (FE) | `ws-client.ts` | なし | `ws-client.ts` 新規 |
| AuthContext | user + wsConnected | user のみ | user + wsConnected |
| 読み取り操作 | REST + WS 混在 | REST | REST (変更なし) |
| 書き込み操作 | WS module_request | REST | WS module_request |
| リアルタイム通知 | WS relayed | なし | WS relayed |
| Vite proxy | `/api` + `/auth` (ws) | `/api` のみ | `/api` + `/ws` (ws) |

---

## 3. 設計

### 3.1 全体アーキテクチャ

#### 3.1.1 セッション一本化モデル

Cernere がユーザーセッションを個別に持つのではなく、Schedula バックエンドと Cernere が
**サービス WS (`/ws/service`)** で常時接続し、セッションライフサイクルを一本化する。

- **id-cache 3 点認証** でユーザー本人の保証は確立済み（JWT 署名検証 + キャッシュ + Cernere `/verify`）
- **service-adapter** で Cernere ↔ Schedula 間のセッション状態を同期
- **破壊的操作** はフロントエンドの REST API ではなく、Schedula バックエンドとの WS セッション経由でのみ実行

```
┌─────────────────────────────────────────────────────────────┐
│  Schedula Frontend (React SPA)                              │
│                                                             │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AuthCtx   │  │ REST API     │  │ WsContext            │  │
│  │ (user)    │─▶│ (読み取り)   │  │ (wsClient)           │  │
│  │           │─▶│ Bearer JWT   │  │ (破壊的操作のみ)     │  │
│  └───────────┘  └──────────────┘  └──────────────────────┘  │
│        │              │                     │                │
└────────│──────────────│─────────────────────│────────────────┘
         │         HTTP REST              WebSocket
         │         (Bearer JWT)           (/ws?token=jwt)
         │              │                     │
┌────────│──────────────│─────────────────────│────────────────┐
│  Schedula Backend (Hono)                                     │
│        │              │                     │                │
│        │     ┌────────▼─────────┐  ┌────────▼─────────────┐  │
│        │     │ REST Routes     │  │ WS Handler           │  │
│        │     │ (GET 読み取り)  │  │ (module_request)     │  │
│        │     └─────────────────┘  └────────────────────┘  │
│        │              │                     │                │
│        │     ┌────────▼─────────────────────▼─────────────┐  │
│        │     │  id-cache 3 点認証                         │  │
│        └────▶│  ① JWT 署名ローカル検証                    │  │
│              │  ② インメモリキャッシュ (TTL 5 分)          │  │
│              │  ③ Cernere /api/auth/verify フォールバック  │  │
│              └────────────────────────────────────────────┘  │
│                                                              │
│        ┌──────────────────────────────────────────────────┐  │
│        │  CernereServiceAdapter                           │  │
│        │  (@ludiars/cernere-service-adapter)              │  │
│        │                                                  │  │
│        │  ┌────────────────────────────────────────────┐  │  │
│        │  │ user_admission → ユーザー DB upsert        │  │  │
│        │  │ user_revoke   → WS セッション強制切断      │  │  │
│        │  │ ping/pong     → サービス接続維持           │  │  │
│        │  └────────────────────────────────────────────┘  │  │
│        └────────────────────┬─────────────────────────────┘  │
└─────────────────────────────│────────────────────────────────┘
                              │
                     サービス WS
                  (/ws/service)
                              │
┌─────────────────────────────│────────────────────────────────┐
│  Cernere (認証基盤)         │                                │
│                             │                                │
│  ┌──────────────────────────▼─────────────────────────────┐  │
│  │ ServiceConnectionRegistry                              │  │
│  │ - service_auth: サービスコード + シークレット検証       │  │
│  │ - user_admission: ユーザー受入通知 → service_token 取得 │  │
│  │ - user_revoke: ユーザー無効化通知                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────┐                │
│  │ Redis: ustate:{user_id} (TTL 7 日)      │                │
│  │ PostgreSQL: users, sessions, services    │                │
│  └──────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

#### 3.1.2 認証・セッションフロー

```
[初回接続]
1. ユーザーが Cernere でログイン → JWT (accessToken) 取得
2. Schedula Frontend が JWT を localStorage に保存

[REST 読み取り]
3. GET /api/* → Bearer JWT → id-cache 3 点認証 → レスポンス
   (従来通り。破壊的操作は REST では受け付けない)

[WS 接続 (破壊的操作)]
4. Frontend: wsClient.connect(jwt) → WS /ws?token=<jwt>
5. Backend: id-cache で JWT 検証 → ユーザー特定
6. Backend: WS セッション登録 (インメモリ)
7. Backend → Frontend: { type: "connected", session_id, user }
8. Frontend: module_request で破壊的操作を送信

[セッション一本化 (Cernere ↔ Schedula)]
9. Schedula 起動時: CernereServiceAdapter.connect() → /ws/service
10. Cernere → Schedula: user_admission { user, ticket_id }
    → Schedula: ユーザー DB upsert + service_token 発行 → admission_response
11. Cernere → Schedula: user_revoke { user_id }
    → Schedula: 該当ユーザーの WS セッション強制切断 + revoked リスト追加
```

### 3.2 フロントエンド変更

#### 3.2.1 WS クライアント追加

`frontend/src/lib/ws-client.ts` を新規作成。
Cernere の `CernereWsClient` と同一プロトコルのクライアントを実装する。

```typescript
// frontend/src/lib/ws-client.ts

type ServerMessage = {
  type: string;
  session_id?: string;
  module?: string;
  action?: string;
  payload?: unknown;
  code?: string;
  message?: string;
  ts?: number;
};

class SchedulaWsClient {
  private ws: WebSocket | null = null;
  private pendingRequests: PendingRequest[] = [];
  private listeners: Array<(msg: ServerMessage) => void> = [];
  private _connected = false;
  private _sessionId: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  get connected() { return this._connected; }
  get sessionId() { return this._sessionId; }

  connect(token: string): Promise<void> { /* Cernere 同等実装 */ }
  disconnect(): void { /* 切断 + 再接続タイマークリア */ }
  sendCommand<T>(module: string, action: string, payload?: unknown): Promise<T> { /* ... */ }
  onMessage(listener: (msg: ServerMessage) => void): () => void { /* ... */ }

  // Schedula 固有: 自動再接続 (WS 切断時に指数バックオフで再接続)
  private scheduleReconnect(token: string): void { /* ... */ }
}

export const wsClient = new SchedulaWsClient();
```

**Cernere との差分:**
- 自動再接続機能を追加（Cernere はブラウザリロード前提、Schedula は長時間操作が多いため）
- WS エンドポイントは `/ws?token=<jwt>`（Cernere の `/auth` と区別）

#### 3.2.2 AuthContext 拡張

`frontend/src/contexts/AuthContext.tsx` を修正。

**追加項目:**
- `wsConnected: boolean` — WS 接続状態
- `connectWs()` — user セット時の自動 WS 接続
- logout 時の `wsClient.disconnect()`

```diff
 interface AuthContextType {
   user: User | null;
   loading: boolean;
+  wsConnected: boolean;
   login: () => void;
   logout: () => Promise<void>;
   googleAuthUrl: string;
 }
```

#### 3.2.3 WS コマンドフック

`frontend/src/lib/ws-commands.ts` を新規作成。
各モジュールの書き込み操作を WS コマンドとしてラップする。

```typescript
// frontend/src/lib/ws-commands.ts
import { wsClient } from "./ws-client";

// 汎用コマンド送信
export async function wsCommand<T>(module: string, action: string, payload?: unknown): Promise<T> {
  return wsClient.sendCommand<T>(module, action, payload);
}

// モジュール別ヘルパー (段階的に追加)
export const wsCalendar = {
  createEvent: (data: CreateEventInput) => wsCommand("calendar", "create_event", data),
  deleteEvent: (id: string) => wsCommand("calendar", "delete_event", { id }),
};

export const wsGroup = {
  create: (data: CreateGroupInput) => wsCommand("group", "create", data),
  delete: (id: string) => wsCommand("group", "delete", { id }),
  // ...
};

// ... 各モジュール
```

#### 3.2.4 Vite 設定更新

```typescript
// frontend/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: true },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',  // Docker 依存を解消
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,  // WebSocket プロキシ追加
      },
    },
  },
});
```

#### 3.2.5 Nginx 設定更新

```nginx
# frontend/nginx.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # REST API proxy
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket proxy (追加)
    location /ws {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;  # 24h (WS 長時間接続)
    }
}
```

### 3.3 バックエンド変更

#### 3.3.1 CernereServiceAdapter 統合（セッション一本化の核）

`src/ws/cernere-bridge.ts` を新規作成。
Schedula バックエンドと Cernere を `/ws/service` で常時接続し、セッションを一本化する。

```typescript
// src/ws/cernere-bridge.ts
import { CernereServiceAdapter } from "@ludiars/cernere-service-adapter";
import { secretManager } from "../config/secrets.js";
import { userRepo } from "../db/repository.js";
import { revokeUserSessions } from "./session.js";

let adapter: CernereServiceAdapter | null = null;

export function getCernereAdapter(): CernereServiceAdapter | null {
  return adapter;
}

export function initCernereBridge(): void {
  const cernereWsUrl = secretManager.get("CERNERE_WS_URL");
  const serviceCode = "schedula";
  const serviceSecret = secretManager.get("CERNERE_SERVICE_SECRET");
  const jwtSecret = secretManager.get("SERVICE_JWT_SECRET");

  if (!cernereWsUrl || !serviceSecret || !jwtSecret) {
    console.warn("[cernere-bridge] Cernere service credentials not configured, skipping");
    return;
  }

  adapter = new CernereServiceAdapter(
    { cernereWsUrl, serviceCode, serviceSecret, jwtSecret },
    {
      onUserAdmission: async (user, organizationId, scopes) => {
        // Cernere から受入通知 → ローカル DB にユーザー upsert
        await userRepo.upsertFromCernere({
          id: user.id,
          name: user.displayName,
          email: user.email,
          role: user.role,
        });
        console.log(`[cernere-bridge] User admitted: ${user.id}`);
      },
      onUserRevoke: async (userId) => {
        // Cernere からユーザー無効化 → 該当ユーザーの WS セッション強制切断
        revokeUserSessions(userId);
        console.log(`[cernere-bridge] User revoked: ${userId}`);
      },
      onConnected: (serviceId) => {
        console.log(`[cernere-bridge] Connected to Cernere (service_id: ${serviceId})`);
      },
      onDisconnected: () => {
        console.warn("[cernere-bridge] Disconnected from Cernere, will reconnect...");
      },
    },
  );

  adapter.connect();
}
```

**ポイント:**
- `user_admission`: Cernere がユーザーをこのサービスに受け入れた際に呼ばれる。ローカル DB にユーザー情報を upsert し、`service_token` を発行して Cernere に返す（adapter が自動処理）
- `user_revoke`: ユーザーのセッションが Cernere 側で無効化された際に呼ばれる。Schedula の WS セッションを強制切断し、以降のリクエストを拒否する
- 自動再接続: adapter が切断時に自動再接続（デフォルト 5 秒間隔）

#### 3.3.2 WS ハンドラ追加

`src/ws/handler.ts` を新規作成。
JWT 検証は **id-cache 3 点認証を流用** する（独自検証は行わない）。

```typescript
// src/ws/handler.ts
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import { createIdCache } from "@ludiars/cernere-id-cache";
import { secretManager } from "../config/secrets.js";
import { registerSession, removeSession } from "./session.js";
import { dispatch } from "./dispatcher.js";
import { getCernereAdapter } from "./cernere-bridge.js";
import { randomUUID } from "node:crypto";

const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "http://localhost:8080");
const jwtSecret = secretManager.get("JWT_SECRET");

// REST ミドルウェアと同じ id-cache インスタンスを使い回す
const idCache = cernereUrl
  ? createIdCache({ idServiceUrl: cernereUrl, jwtSecret, cacheTtlSeconds: 300 })
  : null;

export function setupWebSocket(app: Hono) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.get("/ws", upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    if (!token) throw new Error("Missing token");

    // ── id-cache 3 点認証でユーザー特定 ──────────────
    // ① JWT 署名ローカル検証
    // ② インメモリキャッシュ (TTL 5 分)
    // ③ Cernere /api/auth/verify フォールバック
    const user = idCache
      ? await idCache.resolveUser(token)
      : null;

    if (!user) throw new Error("Authentication failed");

    // revoke チェック (Cernere から user_revoke を受けたユーザーは拒否)
    const adapter = getCernereAdapter();
    if (adapter?.isRevoked(user.id)) {
      throw new Error("User session revoked");
    }

    const sessionId = randomUUID();

    return {
      onOpen(evt, ws) {
        registerSession({ userId: user.id, sessionId, ws, lastPong: Date.now() });

        ws.send(JSON.stringify({
          type: "connected",
          session_id: sessionId,
          user: { id: user.id, name: user.name, role: user.role },
        }));

        // Ping タイマー開始 (30 秒間隔)
      },
      onMessage(evt, ws) {
        // module_request → dispatch → module_response
        // pong → lastPong 更新
      },
      onClose() {
        removeSession(sessionId);
      },
    };
  }));

  return { injectWebSocket };
}
```

**id-cache 3 点認証の適用:**
- REST ミドルウェア (`userContext()`) と同じ認証基盤を WS 接続時にも使う
- 独自 JWT 検証は不要 — id-cache が署名検証 → キャッシュ → Cernere 問合せを一括処理
- revoke チェックは service-adapter の `isRevoked()` で Cernere のセッション無効化と連動

#### 3.3.3 コマンドディスパッチャ

`src/ws/dispatcher.ts` を新規作成。
`module_request` のルーティングを担当する。

```typescript
// src/ws/dispatcher.ts
type CommandHandler = (userId: string, payload: unknown) => Promise<unknown>;

const handlers = new Map<string, Map<string, CommandHandler>>();

export function registerCommand(module: string, action: string, handler: CommandHandler) {
  if (!handlers.has(module)) handlers.set(module, new Map());
  handlers.get(module)!.set(action, handler);
}

export async function dispatch(
  module: string, action: string, userId: string, payload: unknown
): Promise<unknown> {
  const mod = handlers.get(module);
  if (!mod) throw new Error(`Unknown module: ${module}`);
  const handler = mod.get(action);
  if (!handler) throw new Error(`Unknown action: ${module}.${action}`);
  return handler(userId, payload);
}
```

#### 3.3.4 セッション管理

`src/ws/session.ts` を新規作成。
**セッション状態は Cernere と一本化** — ローカルの WS 接続マップはインメモリで管理し、
ライフサイクルイベント（revoke）は Cernere からの通知で制御する。

```typescript
// src/ws/session.ts

interface WsSession {
  userId: string;
  sessionId: string;
  ws: { send(data: string): void; close(): void };
  lastPong: number;
  pingTimer: ReturnType<typeof setInterval> | null;
}

/** sessionId → WsSession */
const sessions = new Map<string, WsSession>();

export function registerSession(session: Omit<WsSession, "pingTimer">): void {
  const pingTimer = setInterval(() => {
    const s = sessions.get(session.sessionId);
    if (!s) return;
    // Pong タイムアウト (10 秒)
    if (Date.now() - s.lastPong > 40_000) {
      s.ws.close();
      removeSession(session.sessionId);
      return;
    }
    s.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
  }, 30_000);

  sessions.set(session.sessionId, { ...session, pingTimer });
}

export function removeSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s?.pingTimer) clearInterval(s.pingTimer);
  sessions.delete(sessionId);
}

export function getSessionsByUser(userId: string): WsSession[] {
  return [...sessions.values()].filter((s) => s.userId === userId);
}

export function broadcastToUser(userId: string, message: unknown): void {
  const json = JSON.stringify(message);
  for (const s of getSessionsByUser(userId)) {
    s.ws.send(json);
  }
}

/**
 * Cernere からの user_revoke に対応。
 * 該当ユーザーの全 WS セッションを強制切断する。
 */
export function revokeUserSessions(userId: string): void {
  for (const s of getSessionsByUser(userId)) {
    s.ws.send(JSON.stringify({
      type: "error",
      code: "session_revoked",
      message: "Session revoked by Cernere",
    }));
    s.ws.close();
    removeSession(s.sessionId);
  }
}
```

**Cernere との連携ポイント:**
- `revokeUserSessions()` は `cernere-bridge.ts` の `onUserRevoke` から呼ばれる
- Schedula 独自の Redis セッションストアは作らない — Cernere が権威セッションを持つ
- ローカルの `Map<sessionId, WsSession>` はあくまで WS 接続の管理用

#### 3.3.5 app.ts への統合

```diff
 // src/app.ts
+import { setupWebSocket } from "./ws/handler.js";

 export function createApp() {
   const app = new Hono();
+
+  // WebSocket ハンドラ登録
+  const { injectWebSocket } = setupWebSocket(app);

   // ... 既存ルート ...

-  return app;
+  return { app, injectWebSocket };
 }
```

```diff
 // src/index.ts
+import { initCernereBridge } from "./ws/cernere-bridge.js";
-const app = createApp();
+const { app, injectWebSocket } = createApp();

 const server = serve({ fetch: app.fetch, port: 3000 }, (info) => {
   console.log(`Schedula listening on :${info.port}`);
 });
+
+injectWebSocket(server);
+
+// Cernere サービス WS 接続 (セッション一本化)
+initCernereBridge();
```

#### 3.3.6 依存追加

```bash
npm install @hono/node-ws @ludiars/cernere-service-adapter
```

### 3.4 段階的移行戦略

既存の REST API を一括で WS に置き換えるのは非現実的。以下の段階で移行する。

#### Phase 1: WS 基盤構築 + Cernere セッション一本化（本設計の範囲）

| 対象 | 内容 |
|------|------|
| バックエンド | CernereServiceAdapter 統合、WS ハンドラ (id-cache 認証)、セッション管理、コマンドディスパッチャ |
| フロントエンド | WsClient、AuthContext 拡張、Vite/Nginx 設定 |
| テスト | WS 接続/切断、Ping/Pong、Cernere bridge 接続、revoke 時の強制切断 |

**Phase 1 で WS 化する操作:**

なし（基盤のみ）。既存 REST は全てそのまま動作する。

#### Phase 2: 破壊的操作の WS 移行

| モジュール | WS 化する操作 | REST 維持する操作 |
|-----------|--------------|-----------------|
| calendar | create, update, delete | list, getEvents |
| group | create, delete, addMember, removeMember | list, getById |
| myplan | create, update, delete | list |
| voting | create, submitVote, close | list, getById |
| facility-booking | create, cancel | list |
| pm | createProject, createTask, sync | list, getById, analytics |
| machina | createMonitor, processWebhook | list, status |
| admin | updateSettings, deleteUser | logs, dbViewer |

#### Phase 3: リアルタイム通知

| 機能 | 実装 |
|------|------|
| グループイベント同期 | グループメンバーへの relay broadcast |
| 予約通知 | 予約作成/キャンセル時の即時通知 |
| PM タスク更新 | 外部同期結果のプッシュ配信 |
| Machina タスク生成 | 自動タスク生成時の即時通知 |

---

## 4. ファイル変更一覧

### 4.1 新規作成

| ファイル | 内容 |
|---------|------|
| `frontend/src/lib/ws-client.ts` | SchedulaWsClient クラス |
| `frontend/src/lib/ws-commands.ts` | WS コマンドヘルパー |
| `src/ws/handler.ts` | WS ハンドラ (Hono node-ws + id-cache 3 点認証) |
| `src/ws/dispatcher.ts` | module_request コマンドディスパッチャ |
| `src/ws/session.ts` | WS セッション管理 (インメモリ + Cernere revoke 連動) |
| `src/ws/cernere-bridge.ts` | CernereServiceAdapter 統合 (セッション一本化) |

### 4.2 修正

| ファイル | 変更内容 |
|---------|---------|
| `frontend/src/contexts/AuthContext.tsx` | wsConnected 状態追加、WS 自動接続 |
| `frontend/vite.config.ts` | `/ws` プロキシ追加、target をローカル変更 |
| `frontend/nginx.conf` | `/ws` location 追加 (WebSocket upgrade) |
| `src/app.ts` | `setupWebSocket()` 呼出追加 |
| `src/index.ts` | `injectWebSocket(server)` + `initCernereBridge()` 追加 |
| `package.json` | `@hono/node-ws` + `@ludiars/cernere-service-adapter` 依存追加 |

### 4.3 変更なし

| ファイル | 理由 |
|---------|------|
| `frontend/src/lib/api.ts` | REST API は Phase 1 では変更なし |
| `frontend/src/App.tsx` | ルーティング構造は変更不要 |
| `frontend/src/lib/module-registry.ts` | UI モジュールシステムは変更不要 |
| `src/plugins/schedula.ts` | Id Service プラグインは変更不要 |
| `modules/**` | Phase 1 ではモジュールの WS 対応は行わない |

---

## 5. WS メッセージプロトコル仕様

Cernere 準拠。Schedula 固有の拡張なし。

### 5.1 接続

```
GET /ws?token=<jwt>
→ Upgrade: websocket
→ Backend: id-cache 3 点認証 (JWT 署名 → キャッシュ → Cernere /verify)
→ Backend: adapter.isRevoked() チェック

Server → Client:
{ "type": "connected", "session_id": "<uuid>", "user": { "id", "name", "role" } }
```

### 5.2 キープアライブ

```
Server → Client: { "type": "ping", "ts": <unix_ms> }
Client → Server: { "type": "pong", "ts": <unix_ms> }
```

- 間隔: 30 秒
- タイムアウト: 10 秒 → セッション切断

### 5.3 コマンド

```
Client → Server:
{ "type": "module_request", "module": "calendar", "action": "create_event", "payload": {...} }

Server → Client:
{ "type": "module_response", "module": "calendar", "action": "create_event", "payload": {...} }

Server → Client (エラー):
{ "type": "error", "code": "command_error", "message": "..." }
```

### 5.4 リレー (Phase 3)

```
Client → Server:
{ "type": "relay", "target": "broadcast", "payload": {...} }

Server → Client:
{ "type": "relayed", "from_session": "<id>", "payload": {...} }
```

---

## 6. テスト計画

### Phase 1 テスト

| テスト | 方法 |
|--------|------|
| WS 接続成功 | JWT 認証済みトークンで接続 → id-cache 3 点認証 → connected メッセージ受信 |
| WS 接続拒否 (無効 JWT) | 無効トークンで接続 → id-cache 検証失敗 → 即座に切断 |
| WS 接続拒否 (revoked) | Cernere revoke 済みユーザーで接続 → adapter.isRevoked() → 拒否 |
| Ping/Pong | 30 秒後に ping 受信 → pong 返送 → 接続維持 |
| Pong タイムアウト | pong 未返送 → 10 秒後に切断 |
| Cernere bridge 接続 | initCernereBridge() → service_authenticated 受信 |
| user_revoke 強制切断 | Cernere → user_revoke → 該当ユーザーの WS 全切断 |
| user_admission upsert | Cernere → user_admission → ユーザー DB に反映 |
| 既存 REST 動作確認 | 全既存テスト (`npm test`) がパスすること |
| フロントエンド Lint | `frontend/npm run lint` エラー 0 |
| フロントエンドビルド | `frontend/npm run build` 成功 |

### CI 統合

既存の `scripts/ci-check.sh` に追加テストは不要（Phase 1 は基盤のみ）。
Phase 2 以降で WS コマンドのユニットテストを追加する。
