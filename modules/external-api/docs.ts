/**
 * 外部API ドキュメント
 *
 * GET /api/external/docs で返される JSON 形式のAPIリファレンス。
 */

export const apiDocumentation = {
  title: "Schedula External API",
  version: "1.0.0",
  description: "Schedula の外部連携用API。APIクライアントキーで認証し、カレンダー・リマインダー・予定設定を操作できます。",

  authentication: {
    description: "すべての外部APIリクエストには以下のヘッダーが必要です。",
    headers: {
      "X-API-Client-ID": "APIクライアントID (scl_... で始まる文字列)",
      "X-API-Client-Secret": "APIクライアントシークレット",
    },
    scopes: {
      calendar: "カレンダー予定の読み取り・作成・更新・削除",
      reminders: "リマインダー設定・通知履歴の操作",
      schedules: "プラン・マイプランの操作",
    },
    keyManagement: {
      description: "APIキーの管理にはJWTトークン認証 (通常のログイン) が必要です。",
      endpoints: [
        { method: "GET", path: "/api/external/clients", description: "APIクライアント一覧" },
        { method: "POST", path: "/api/external/clients", description: "APIクライアント作成", body: { name: "string (必須)", scopes: "string[] (任意, デフォルト: 全スコープ)" } },
        { method: "POST", path: "/api/external/clients/:id/regenerate", description: "クライアントID・シークレット再発行" },
        { method: "PUT", path: "/api/external/clients/:id", description: "APIクライアント更新", body: { name: "string", scopes: "string[]", isActive: "boolean" } },
        { method: "DELETE", path: "/api/external/clients/:id", description: "APIクライアント削除" },
      ],
    },
  },

  modules: {
    calendar: {
      description: "カレンダー予定の操作 (scope: calendar)",
      basePath: "/api/external/calendar",
      endpoints: [
        {
          method: "GET",
          path: "/events",
          description: "予定一覧を取得",
          response: {
            events: [
              {
                id: "string",
                title: "string",
                description: "string | null",
                day: "number (0-6, 0=月曜)",
                period: "number (0-10)",
                duration: "number",
                startTime: "string | null (HH:MM)",
                endTime: "string | null (HH:MM)",
                eventType: "string (personal | school_event)",
                isPrivate: "boolean",
                createdAt: "string (ISO 8601)",
                updatedAt: "string (ISO 8601)",
              },
            ],
          },
        },
        {
          method: "GET",
          path: "/events/:id",
          description: "予定の詳細を取得",
          params: { id: "イベントID" },
        },
        {
          method: "POST",
          path: "/events",
          description: "新しい予定を作成",
          body: {
            title: "string (必須)",
            description: "string (任意)",
            day: "number 0-6 (必須)",
            period: "number 0-10 (必須)",
            duration: "number (任意, デフォルト: 1)",
            startTime: "string HH:MM (任意)",
            endTime: "string HH:MM (任意)",
            eventType: "string (任意, デフォルト: personal)",
            isPrivate: "boolean (任意, デフォルト: true)",
          },
          response: { event: "作成された予定オブジェクト" },
          statusCode: 201,
        },
        {
          method: "PUT",
          path: "/events/:id",
          description: "予定を更新",
          params: { id: "イベントID" },
          body: {
            title: "string",
            description: "string",
            day: "number",
            period: "number",
            duration: "number",
            startTime: "string",
            endTime: "string",
            eventType: "string",
            isPrivate: "boolean",
          },
        },
        {
          method: "DELETE",
          path: "/events/:id",
          description: "予定を削除",
          params: { id: "イベントID" },
        },
      ],
    },

    reminders: {
      description: "リマインダー・通知設定の操作 (scope: reminders)",
      basePath: "/api/external/reminders",
      endpoints: [
        {
          method: "GET",
          path: "/preferences",
          description: "通知設定を取得",
          response: {
            preferences: [
              {
                id: "string",
                channel: "string (in_app | email | push | webhook)",
                enabledEvents: "string[]",
                reminder: {
                  dayBefore: "boolean",
                  dayBeforeTime: "string (HH:MM)",
                  morningOf: "boolean",
                  morningOfTime: "string (HH:MM)",
                  before: "boolean",
                  beforeMinutes: "number",
                },
                quietHoursStart: "string (HH:MM)",
                quietHoursEnd: "string (HH:MM)",
              },
            ],
          },
        },
        {
          method: "PUT",
          path: "/preferences",
          description: "通知設定を作成・更新 (upsert)",
          body: {
            channel: "string (必須)",
            enabledEvents: "string[] (任意)",
            reminder: {
              dayBefore: "boolean",
              dayBeforeTime: "string (HH:MM)",
              morningOf: "boolean",
              morningOfTime: "string (HH:MM)",
              before: "boolean",
              beforeMinutes: "number",
            },
            quietHoursStart: "string (HH:MM)",
            quietHoursEnd: "string (HH:MM)",
          },
        },
        {
          method: "GET",
          path: "/notifications",
          description: "通知履歴を取得",
        },
        {
          method: "POST",
          path: "/notifications/:id/read",
          description: "通知を既読にする",
          params: { id: "通知ID" },
        },
        {
          method: "GET",
          path: "/webhooks",
          description: "Webhook一覧を取得",
        },
        {
          method: "GET",
          path: "/reminders",
          description: "リマインダー一覧を取得 (?status=pending でフィルタ可)",
        },
        {
          method: "POST",
          path: "/reminders",
          description: "リマインダーを作成",
          body: {
            title: "string (必須)",
            description: "string (任意)",
            remindAt: "string (必須, ISO 8601)",
            repeatRule: "string (任意, none | daily | weekly | monthly | yearly)",
          },
          statusCode: 201,
        },
        {
          method: "PUT",
          path: "/reminders/:id",
          description: "リマインダーを更新",
          params: { id: "リマインダーID" },
          body: {
            title: "string",
            description: "string",
            remindAt: "string (ISO 8601)",
            repeatRule: "string",
            status: "string (pending | done | cancelled)",
          },
        },
        {
          method: "DELETE",
          path: "/reminders/:id",
          description: "リマインダーを削除",
          params: { id: "リマインダーID" },
        },
        {
          method: "PATCH",
          path: "/reminders/:id/done",
          description: "リマインダーを完了にする",
          params: { id: "リマインダーID" },
        },
      ],
    },

    schedules: {
      description: "予定設定 (プラン・マイプラン) の操作 (scope: schedules)",
      basePath: "/api/external/schedules",
      endpoints: [
        {
          method: "GET",
          path: "/plans",
          description: "プラン一覧を取得",
        },
        {
          method: "POST",
          path: "/plans",
          description: "プランを作成",
          body: {
            name: "string (必須)",
            description: "string (任意)",
            days: "number[] (必須, 0-6の配列)",
            startPeriod: "number (必須, 0-10)",
            duration: "number (任意, デフォルト: 1)",
            eventType: "string (任意)",
            isPrivate: "boolean (任意)",
          },
          statusCode: 201,
        },
        {
          method: "DELETE",
          path: "/plans/:id",
          description: "プランと関連イベントを削除",
          params: { id: "プランID" },
        },
        {
          method: "GET",
          path: "/myplans",
          description: "マイプラン一覧を取得",
        },
        {
          method: "POST",
          path: "/myplans",
          description: "マイプランを作成",
          body: {
            name: "string (必須)",
            patternType: "string (任意, basic | special)",
            validFrom: "string (任意, YYYY-MM-DD)",
            validUntil: "string (任意, YYYY-MM-DD)",
            weeklySchedule: "Record<string, Array<{ startTime, endTime, title }>> (任意)",
            groupId: "string (任意)",
          },
          statusCode: 201,
        },
        {
          method: "DELETE",
          path: "/myplans/:id",
          description: "マイプランと関連イベントを削除",
          params: { id: "マイプランID" },
        },
      ],
    },
  },

  errors: {
    description: "エラーレスポンスの形式",
    format: {
      error: "string (エラーコード)",
      message: "string (詳細メッセージ, 任意)",
    },
    statusCodes: {
      400: "Bad Request - リクエストパラメータが不正",
      401: "Unauthorized - 認証に失敗 (APIキーが無効)",
      403: "Forbidden - スコープ不足またはクライアント無効",
      404: "Not Found - リソースが見つからない",
      409: "Conflict - リソースの競合 (スロット重複など)",
      500: "Internal Server Error - サーバ内部エラー",
    },
  },

  examples: {
    curl: {
      listEvents: `curl -H "X-API-Client-ID: scl_abc123..." -H "X-API-Client-Secret: def456..." https://your-server/api/external/calendar/events`,
      createEvent: `curl -X POST -H "Content-Type: application/json" -H "X-API-Client-ID: scl_abc123..." -H "X-API-Client-Secret: def456..." -d '{"title":"Meeting","day":1,"period":3}' https://your-server/api/external/calendar/events`,
    },
  },
};
