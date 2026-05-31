# MyPlan コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/myplan/routes.ts` | マイプランの CRUD、personalEvent 自動生成ロジックを含む API ルート |

## 依存関係

- `src/db/repository.ts` — `myPlanRepo`, `planRepo`, `personalEventRepo` を使用
- `src/db/schema.ts` — `myPlans`, `plans`, `personalEvents` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/myplans | マイプラン一覧 |
| POST | /api/myplans | マイプラン作成 |
| PUT | /api/myplans/:id | マイプラン更新 |
| DELETE | /api/myplans/:id | マイプラン削除 |
| PATCH | /api/myplans/:id/toggle | 有効/無効切り替え |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| マイプラン | `frontend/src/pages/MyPlanPage.tsx` |
