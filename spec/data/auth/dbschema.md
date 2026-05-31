# Auth DBスキーマ

## users テーブル

ユーザーの基本情報と認証データを保持する。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ユーザーID |
| name | text | ユーザー名 |
| email | text (UNIQUE) | メールアドレス |
| role | text | ロール (`admin` / `group_leader` / `general`) |
| major | text | 専攻 (nullable) |
| passwordHash | text | bcrypt ハッシュ (nullable: OAuth ユーザーは null) |
| googleId | text (UNIQUE) | Google アカウント ID (nullable) |
| googleAccessToken | text | Google OAuth アクセストークン (nullable) |
| googleRefreshToken | text | Google OAuth リフレッシュトークン (nullable) |
| googleTokenExpiresAt | integer | Google トークン有効期限 (nullable) |
| googleScopes | text (JSON) | 認可済みスコープ配列 (nullable) |
| calendarAccessId | text | Google Calendar 連携用 ID (nullable) |
| lastLoginAt | integer (timestamp) | 最終ログイン日時 (nullable) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

## sessions テーブル

JWT リフレッシュトークンの管理。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | セッション ID |
| userId | text (FK → users.id) | ユーザー ID |
| refreshToken | text (UNIQUE) | リフレッシュトークン |
| expiresAt | integer (timestamp) | 有効期限 |
| createdAt | integer (timestamp) | 作成日時 |

## userProfiles テーブル

ユーザーの自己紹介・プロフィール情報。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | プロフィール ID |
| userId | text (FK → users.id, UNIQUE) | ユーザー ID |
| bio | text | 自己紹介 |
| displayName | text | 表示名 (nullable) |
| avatarUrl | text | アバター URL (nullable) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

## userProjectRoles テーブル

ユーザーがグループごとに担当する業務ロール。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| userId | text (FK → users.id) | ユーザー ID |
| groupId | text (FK → groups.id) | グループ ID |
| roleName | text | 役割名 (例: "デザイナー", "PM") |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**UNIQUE**: (userId, groupId, roleName)
