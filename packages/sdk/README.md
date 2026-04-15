# @ludiars/schedula-sdk

Schedula モジュール実装者向けの SDK。`defineModule()` でマニフェストと実装を宣言し、Schedula ホストに読み込ませる。

## Install

```bash
npm install @ludiars/schedula-sdk
```

## 最小の例

```typescript
import { defineModule } from "@ludiars/schedula-sdk";
import { pgTable, text } from "drizzle-orm/pg-core";

const myEvents = pgTable("my_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
});

export default defineModule({
  id: "example",
  name: "Example Module",
  schedulaApiVersion: "^1.0.0",
  scope: "per-group",

  tables: { myEvents },

  userData: {
    subscribed: {
      type: "boolean",
      description: "このモジュールの通知を受け取るか",
      defaultValue: true,
    },
  },

  basePath: "/api/example",
  routes: (app, ctx) => {
    app.get("/events", async (c) => {
      const rows = /* ... */
      return c.json({ events: rows });
    });
  },

  wsCommands: {
    "create_event": async (userId, payload, ctx) => {
      const user = await ctx.users.get(userId);
      ctx.audit(userId, "create_event", `Created event as ${user.name}`);
      /* ... */
    },
  },

  onUserOptout: async (ctx, userId) => {
    // Cernere からの opt-out 通知で module 所有データを削除
  },
});
```

## 提供される Context

| API | 用途 |
|-----|------|
| `ctx.users.get(id)` | Cernere 経由でユーザー識別情報取得 |
| `ctx.userData.get(uid, key)` | Cernere project_data proxy (opt-out 対応) |
| `ctx.db.raw` | Drizzle ORM instance (host 注入) |
| `ctx.ws.broadcastToGroup(gid, event, data)` | WebSocket broadcast |
| `ctx.secrets.get(key)` | シークレット (module ID prefix 自動付与) |
| `ctx.audit(uid, action, detail)` | 監査ログ |
| `ctx.modules.invoke(mid, cmd, data)` | 依存モジュール呼び出し |
| `ctx.permissions.requireSystemAdmin()` | 権限ミドルウェア |

## 個人データ保管ポリシー

個人データ (name/email/role/認証トークン) は **Cernere** で管理される。
モジュールは `ctx.users` と `ctx.userData` 経由でアクセスし、自前のテーブルに
保管しない。アプリドメインデータ (voting, events 等) は `user_id` のみ
参照し、表示時に `ctx.users.getMany()` で identity を結合する。

詳細: [AIFormat RULE § 5](https://github.com/LUDIARS/AIFormat/blob/main/RULE.md#5-個人データの保管禁止)

## テスト

```typescript
import { createMockContext } from "@ludiars/schedula-sdk/testing";

const ctx = createMockContext({
  users: { "u1": { name: "Alice", email: "alice@test.com" } },
});
// module の WS handler を直接呼び出してテスト
```

## ライセンス

MIT
