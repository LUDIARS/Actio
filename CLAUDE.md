# Schedula 開発ルール

## データベースアクセス

**ルートハンドラから `db` を直接操作してはいけません。** 必ず `src/db/repository.ts` のリポジトリ層を経由してください。

### なぜ？

- 本プロジェクトは SQLite / PostgreSQL / MySQL をサポートしており、`.all()` `.run()` `.get()` 等の SQLite 固有メソッドは PostgreSQL で動かない
- リポジトリ層は `await db.select().from(...)` 等の Drizzle ORM 汎用 API のみを使用し、方言差異を吸収する
- ルートハンドラをシンプルに保ち、テスタビリティを確保する

### やること

1. 新しいテーブルや操作が必要な場合、まず `src/db/repository.ts` にリポジトリ関数を追加する
2. ルートハンドラからはリポジトリ関数を呼び出す
3. リポジトリ内では必ず `await` を付けて Drizzle クエリを実行する（`.all()` `.run()` `.get()` は使用禁止）

### 例

```typescript
// ✅ 正しい: リポジトリ経由
import { departmentRepo } from "../../src/db/repository.js";

m1.get("/departments", async (c) => {
  const departments = await departmentRepo.findAll();
  return c.json({ departments });
});

// ❌ 間違い: 直接 db アクセス
import { db, curriculumSchema } from "../../src/db/connection.js";

m1.get("/departments", async (c) => {
  const rows = db.select().from(curriculumSchema.departments).all(); // SQLite 固有！
  return c.json({ departments: rows });
});
```

### 既存リポジトリ

- `userRepo` / `sessionRepo` — 認証関連
- `departmentRepo` / `instructorRepo` / `curriculumRepo` / `availableSlotRepo` — M1 カリキュラム関連

## プロジェクト構造

- `src/` — バックエンド (Hono + TypeScript)
- `frontend/` — フロントエンド (React 19 + Vite)
- `modules/` — 機能モジュール (M1〜M6)
- `src/db/schema.ts` — メインスキーマ
- `src/db/curriculum-schema.ts` — M1 カリキュラムスキーマ
- `src/db/repository.ts` — リポジトリ抽象化層
- `src/db/dialects/` — DB方言別の接続実装
