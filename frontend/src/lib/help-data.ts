/**
 * Help documentation data structure.
 *
 * Each module has hierarchical help content organized by topic.
 * `requiredRole` controls visibility based on user role:
 *   - undefined  = visible to all authenticated users
 *   - "admin"    = admin only
 *   - "group_leader" = group_leader and admin
 *
 * `tutorialId` is reserved for future interactive tutorial integration.
 * When a tutorial system is implemented, components can check this ID
 * to attach step-by-step walkthroughs to specific help topics.
 */

export interface HelpStep {
  title: string;
  description: string;
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  /** Detailed content paragraphs */
  content: string[];
  /** Ordered workflow steps (optional) */
  steps?: HelpStep[];
  /** Role restriction */
  requiredRole?: "admin" | "group_leader";
  /** Reserved for future interactive tutorial binding */
  tutorialId?: string;
  /** Child topics */
  children?: HelpTopic[];
}

export interface HelpModule {
  id: string;
  /** Module display name */
  title: string;
  /** Short description shown in list */
  description: string;
  /** Icon character (emoji-free, use a simple symbol) */
  icon: string;
  /** Corresponding frontend route (for linking) */
  route?: string;
  /** Role restriction for entire module */
  requiredRole?: "admin" | "group_leader";
  topics: HelpTopic[];
}

// ─── Help Content ───

export const HELP_MODULES: HelpModule[] = [
  // ── Getting Started ──
  {
    id: "getting-started",
    title: "はじめに",
    description: "Schedula の基本的な使い方を学びます",
    icon: "S",
    topics: [
      {
        id: "overview",
        title: "Schedula とは",
        summary: "スケジュール管理プラットフォームの概要",
        content: [
          "Schedula は、教育機関向けのスケジュール管理プラットフォームです。カリキュラムの配置管理、グループスケジュール、個人予定の管理、教室予約など、スケジュールに関わるあらゆる機能を統合的に提供します。",
          "ダッシュボードから各機能にアクセスでき、サイドバーのメニューから必要なモジュールに移動できます。",
        ],
        tutorialId: "onboarding-overview",
      },
      {
        id: "navigation",
        title: "画面の操作方法",
        summary: "サイドバー・メニューの使い方",
        content: [
          "サイドバーには利用可能なモジュールが一覧表示されます。「編集」ボタンを押すと、不要なモジュールを非表示にしてメニューを整理できます。",
          "モバイル端末では、左上のハンバーガーメニューからサイドバーを開閉できます。",
        ],
        steps: [
          { title: "サイドバーを確認", description: "画面左のサイドバーに各モジュールへのリンクがあります" },
          { title: "編集モード", description: "「編集」ボタンをクリックすると、モジュールの表示/非表示を切り替えられます" },
          { title: "ダッシュボード", description: "「Dashboard」をクリックすると、今日のスケジュール概要が表示されます" },
        ],
        tutorialId: "navigation-basics",
      },
      {
        id: "roles",
        title: "ユーザー権限について",
        summary: "管理者・グループリーダー・一般ユーザーの違い",
        content: [
          "Schedula には3つのユーザー権限があります。",
          "【管理者 (admin)】すべての機能にアクセスでき、カリキュラムの設定、ユーザー管理、システム設定の変更が可能です。",
          "【グループリーダー (group_leader)】グループの管理、メンバーの追加・削除、グループスケジュールの設定ができます。",
          "【一般 (general)】自分の予定管理、グループへの参加、カレンダーの閲覧が可能です。",
        ],
      },
    ],
  },

  // ── M1: Curriculum Management ──
  {
    id: "curriculum",
    title: "カリキュラム管理 (M1)",
    description: "学科・講師・カリキュラムの設定と時間割の配置",
    icon: "C",
    route: "/schema-management",
    requiredRole: "admin",
    topics: [
      {
        id: "curriculum-overview",
        title: "カリキュラム管理の流れ",
        summary: "カリキュラムを組み立てる全体的な手順",
        content: [
          "カリキュラム管理では、まず基本データ（学科・講師・科目）を登録し、次に時間割への配置を行います。",
          "全体の流れは以下の通りです：スキーマ管理でマスタデータを設定 → データ管理で時間割に配置 → 確定して運用開始。",
        ],
        steps: [
          { title: "1. 学科を登録", description: "スキーマ管理 → 学科タブで、学科名を登録します" },
          { title: "2. 講師を登録", description: "スキーマ管理 → 講師タブで、講師名と担当可能な時間帯を設定します" },
          { title: "3. カリキュラムを作成", description: "スキーマ管理 → カリキュラムタブで、科目と週あたりのコマ数を設定します" },
          { title: "4. 期間を設定", description: "スキーマ管理 → 期間タブで、カリキュラムの有効期間（学期）を設定します" },
          { title: "5. 時間割に配置", description: "データ管理で、各科目を時間割グリッドにドラッグ＆ドロップで配置します" },
          { title: "6. 配置を確定", description: "配置が完了したら「確定」ボタンで時間割を確定させます" },
        ],
        requiredRole: "admin",
        tutorialId: "curriculum-setup-flow",
        children: [
          {
            id: "schema-departments",
            title: "学科の管理",
            summary: "学科の追加・編集・削除",
            content: [
              "スキーマ管理ページの「学科」タブから、学科を追加・編集・削除できます。",
              "学科名を入力して「追加」ボタンをクリックすると新しい学科が登録されます。登録した学科はカリキュラムや講師の割り当てに使用されます。",
            ],
            requiredRole: "admin",
            tutorialId: "schema-departments",
          },
          {
            id: "schema-instructors",
            title: "講師の管理",
            summary: "講師の登録と担当設定",
            content: [
              "スキーマ管理ページの「講師」タブから、講師を管理します。",
              "講師名、担当学科、対応可能な曜日・時限を設定できます。この情報は自動配置スケジューラで制約条件として使用されます。",
            ],
            requiredRole: "admin",
            tutorialId: "schema-instructors",
          },
          {
            id: "schema-curricula",
            title: "カリキュラム（科目）の設定",
            summary: "科目の登録と週コマ数の設定",
            content: [
              "カリキュラムタブでは、各学科に紐づく科目を登録します。",
              "科目名、担当講師、週あたりのコマ数、必要な教室タイプなどを設定します。この情報をもとに時間割が構築されます。",
            ],
            requiredRole: "admin",
            tutorialId: "schema-curricula",
          },
          {
            id: "data-placement",
            title: "時間割への配置",
            summary: "グリッドでの科目配置と確定",
            content: [
              "データ管理ページでは、7日×11コマの時間割グリッドに科目を配置します。",
              "未配置の科目一覧から、グリッドのセルをクリックして科目を選択すると配置されます。配置済みの科目はセルをクリックして移動や削除ができます。",
              "すべての科目を配置したら「確定」ボタンを押して時間割を確定させます。確定後も再編集は可能です。",
            ],
            requiredRole: "admin",
            tutorialId: "data-placement",
          },
        ],
      },
      {
        id: "curriculum-migration",
        title: "マイグレーション機能",
        summary: "カリキュラムデータの自動変換",
        content: [
          "マイグレーション機能を使うと、カリキュラムの配置データを他のモジュール形式に自動変換できます。",
          "「学科→グループ変換」で学科をグループに登録し、「スケジュール→プラン変換」でカリキュラムの配置をプラン形式に変換します。",
        ],
        requiredRole: "admin",
        tutorialId: "curriculum-migration",
      },
    ],
  },

  // ── Schedule Management (Calendar, MyPlan, Groups) ──
  {
    id: "schedule",
    title: "予定管理",
    description: "個人予定・マイプラン・グループスケジュールの管理",
    icon: "P",
    topics: [
      {
        id: "calendar-usage",
        title: "カレンダーの使い方",
        summary: "個人予定の追加と Google Calendar 連携",
        content: [
          "カレンダーページでは、個人の予定を管理できます。手動での予定追加のほか、Google Calendar と連携して既存の予定を同期できます。",
          "予定の追加は「新規予定」ボタンから行います。日時、タイトル、メモを入力して保存します。",
        ],
        steps: [
          { title: "予定を追加", description: "カレンダーページで「新規予定」をクリックし、日時とタイトルを入力します" },
          { title: "Google Calendar 連携", description: "ダッシュボードの Google Calendar セクションから連携を設定できます" },
          { title: "コンフリクト確認", description: "他の予定と重複がある場合、カレンダーページで警告が表示されます" },
        ],
        tutorialId: "calendar-basics",
      },
      {
        id: "myplan-usage",
        title: "マイプランの使い方",
        summary: "週間ルーティーンの設定",
        content: [
          "マイプランでは、毎週繰り返される定期的な予定（ルーティーン）を設定できます。",
          "例えば「毎週月曜の1限は英語」「毎週水曜の3限はゼミ」のように、週単位のスケジュールテンプレートを作成します。",
          "作成したプランは時間割グリッドに反映され、他の予定との重複チェックに使用されます。",
        ],
        steps: [
          { title: "プランを作成", description: "マイプランページで「新規プラン」をクリックし、プラン名を入力します" },
          { title: "時間帯を設定", description: "グリッドのセルをクリックして、曜日と時限に予定を配置します" },
          { title: "プランを有効化", description: "作成したプランを選択状態にすると、カレンダーに反映されます" },
        ],
        tutorialId: "myplan-basics",
      },
      {
        id: "group-schedule",
        title: "グループスケジュール",
        summary: "グループの作成とメンバー管理",
        content: [
          "グループ機能では、クラスやゼミなどのグループを作成し、共通のスケジュールを管理できます。",
          "グループを作成すると招待コードが発行され、メンバーはそのコードでグループに参加できます。",
        ],
        steps: [
          { title: "グループを作成", description: "グループページで「新規グループ」をクリックし、グループ名を入力します" },
          { title: "メンバーを招待", description: "生成された招待コードをメンバーに共有します" },
          { title: "スケジュールを追加", description: "グループのスケジュールタブから共通の予定を設定します" },
          { title: "個別予定を管理", description: "行事や休日などのグループ個別予定を日付ベースで登録します" },
        ],
        tutorialId: "group-schedule-basics",
      },
    ],
  },

  // ── Smart Scheduler ──
  {
    id: "smart-scheduler",
    title: "自動配置スケジューラ",
    description: "制約条件に基づく時間割の自動生成",
    icon: "A",
    route: "/smart-scheduler",
    topics: [
      {
        id: "scheduler-usage",
        title: "自動配置の使い方",
        summary: "タスク設定から自動配置の実行まで",
        content: [
          "自動配置スケジューラは、講師の空き時間や教室の制約条件を考慮して、最適な時間割を自動的に生成します。",
          "タスクを作成して制約条件を設定し、ソルバーを実行すると候補が提示されます。プレビューを確認して確定すると時間割に反映されます。",
        ],
        steps: [
          { title: "タスクを作成", description: "自動配置ページで「新規タスク」をクリックし、配置する科目群を選択します" },
          { title: "制約条件を設定", description: "講師の空き時間、教室の制約、休日設定などを確認・調整します" },
          { title: "ソルバーを実行", description: "「実行」ボタンで自動配置を開始します。処理に少し時間がかかる場合があります" },
          { title: "結果をプレビュー", description: "生成された候補を時間割グリッドで確認します" },
          { title: "配置を確定", description: "プレビューが問題なければ「確定」ボタンで時間割に反映させます" },
        ],
        requiredRole: "admin",
        tutorialId: "smart-scheduler-flow",
      },
    ],
  },

  // ── Reservations (M4) ──
  {
    id: "reservations",
    title: "教室予約 (M4)",
    description: "教室・設備の予約管理",
    icon: "R",
    route: "/reservations",
    topics: [
      {
        id: "reservation-usage",
        title: "教室予約の使い方",
        summary: "予約の作成・確認・キャンセル",
        content: [
          "教室予約機能では、教室や設備の利用予約を管理できます。",
          "空き教室を検索し、日時を指定して予約を作成します。予約一覧から既存の予約の確認やキャンセルも行えます。",
        ],
        steps: [
          { title: "予約を作成", description: "予約ページで「新規予約」をクリックし、教室・日時・用途を入力します" },
          { title: "予約一覧を確認", description: "現在の予約状況を一覧で確認できます" },
          { title: "予約をキャンセル", description: "不要になった予約は「キャンセル」ボタンで取り消せます" },
        ],
        tutorialId: "reservation-basics",
      },
    ],
  },

  // ── Notifications (M5) ──
  {
    id: "notifications",
    title: "通知設定 (M5)",
    description: "Webhook 通知の設定と管理",
    icon: "N",
    route: "/notifications",
    topics: [
      {
        id: "notification-setup",
        title: "通知の設定方法",
        summary: "Webhook の登録と通知の受け取り方",
        content: [
          "通知機能では、スケジュールの変更やイベントの通知を Webhook で受け取ることができます。",
          "Slack や Discord などの外部サービスに連携して、リアルタイムで通知を受け取れます。",
        ],
        steps: [
          { title: "Webhook を登録", description: "通知ページで「新規 Webhook」をクリックし、通知先の URL を入力します" },
          { title: "イベントを選択", description: "どのイベント（予定変更、新規予約など）で通知するかを選択します" },
          { title: "テスト送信", description: "「テスト」ボタンで通知が正しく届くか確認します" },
          { title: "通知設定を調整", description: "通知設定タブで、通知の頻度や種類をカスタマイズします" },
        ],
        tutorialId: "notification-setup",
      },
    ],
  },

  // ── Voting (M6) ──
  {
    id: "voting",
    title: "日程調整 (M6)",
    description: "グループでの日程調整投票",
    icon: "V",
    route: "/voting",
    topics: [
      {
        id: "voting-usage",
        title: "日程調整の使い方",
        summary: "投票イベントの作成と参加",
        content: [
          "日程調整機能では、グループメンバー間で都合の良い日時を投票で決定できます。",
          "イベントを作成して候補日時を設定し、メンバーに投票してもらうことで最適な日程を見つけられます。",
        ],
        steps: [
          { title: "イベントを作成", description: "日程調整ページで「新規イベント」をクリックし、タイトルと候補日時を入力します" },
          { title: "候補日時を追加", description: "参加者が選べる候補の日時を複数設定します" },
          { title: "メンバーに共有", description: "イベントのリンクをメンバーに共有して投票を依頼します" },
          { title: "結果を確認", description: "全員の投票結果から最も都合の良い日時を確認します" },
        ],
        tutorialId: "voting-basics",
      },
    ],
  },

  // ── Holiday Management ──
  {
    id: "holidays",
    title: "休日管理",
    description: "祝日の管理とグループ休日の設定",
    icon: "H",
    topics: [
      {
        id: "holiday-management",
        title: "休日の管理方法",
        summary: "日本の祝日同期とカスタム休日",
        content: [
          "休日管理機能では、日本の祝日の自動取得と、グループ固有の休日・特別期間を設定できます。",
          "設定した休日はスケジュール配置時に自動的に考慮され、休日にはスケジュールが配置されません。",
        ],
        steps: [
          { title: "祝日を同期", description: "日本の祝日を自動計算してデータベースに一括登録します" },
          { title: "グループ休日を追加", description: "グループページの「個別予定」タブから、グループ固有の休日を追加します" },
          { title: "審査会期間を設定", description: "試験期間や審査会期間を設定して、通常のスケジュールから除外できます" },
        ],
        tutorialId: "holiday-management",
      },
    ],
  },

  // ── Admin ──
  {
    id: "admin",
    title: "管理者機能",
    description: "ユーザー管理・システム設定",
    icon: "X",
    requiredRole: "admin",
    topics: [
      {
        id: "user-management",
        title: "ユーザー管理",
        summary: "ユーザーの一覧と権限変更",
        content: [
          "ユーザー管理ページでは、登録済みの全ユーザーを一覧表示し、権限（ロール）を変更できます。",
          "ユーザーのロールは「管理者」「グループリーダー」「一般」の3段階で、管理者が変更できます。",
        ],
        requiredRole: "admin",
        tutorialId: "user-management",
      },
      {
        id: "system-settings",
        title: "システム設定",
        summary: "アプリケーションの設定変更",
        content: [
          "設定ページでは、アプリケーション全体の動作設定を変更できます。",
          "データのエクスポート機能もこのページから利用できます。",
        ],
        requiredRole: "admin",
        tutorialId: "system-settings",
      },
    ],
  },
];

// ─── Page-specific help mapping ───
// Maps page routes to relevant help module/topic IDs for the ? button overlay

export interface PageHelpConfig {
  /** Module ID to show */
  moduleId: string;
  /** Specific topic ID to highlight (optional) */
  topicId?: string;
  /** Brief contextual tip for the page */
  quickTip: string;
}

export const PAGE_HELP_MAP: Record<string, PageHelpConfig> = {
  "/": {
    moduleId: "getting-started",
    topicId: "overview",
    quickTip: "ダッシュボードでは、今日のスケジュール概要と最近のアクティビティを確認できます。",
  },
  "/schema-management": {
    moduleId: "curriculum",
    topicId: "curriculum-overview",
    quickTip: "学科・講師・カリキュラムのマスタデータを管理します。まず学科を登録し、次に講師、最後にカリキュラムを設定してください。",
  },
  "/data-management": {
    moduleId: "curriculum",
    topicId: "data-placement",
    quickTip: "時間割グリッドに科目を配置します。セルをクリックして科目を選択・配置してください。",
  },
  "/my-plan": {
    moduleId: "schedule",
    topicId: "myplan-usage",
    quickTip: "毎週繰り返す定期的なスケジュールを設定します。プランを作成し、グリッドに予定を配置してください。",
  },
  "/groups": {
    moduleId: "schedule",
    topicId: "group-schedule",
    quickTip: "グループを作成してメンバーを管理します。招待コードを共有してメンバーを追加できます。",
  },
  "/calendar": {
    moduleId: "schedule",
    topicId: "calendar-usage",
    quickTip: "個人の予定を管理します。Google Calendar と連携して予定を同期することもできます。",
  },
  "/smart-scheduler": {
    moduleId: "smart-scheduler",
    topicId: "scheduler-usage",
    quickTip: "制約条件をもとに時間割を自動生成します。タスクを作成してソルバーを実行してください。",
  },
  "/reservations": {
    moduleId: "reservations",
    topicId: "reservation-usage",
    quickTip: "教室や設備の予約を管理します。空き教室を確認して予約を作成してください。",
  },
  "/notifications": {
    moduleId: "notifications",
    topicId: "notification-setup",
    quickTip: "Webhook 通知を設定して、スケジュール変更の通知を受け取れます。",
  },
  "/voting": {
    moduleId: "voting",
    topicId: "voting-usage",
    quickTip: "グループメンバーと日程調整を行います。候補日時を設定して投票してもらいましょう。",
  },
  "/admin/users": {
    moduleId: "admin",
    topicId: "user-management",
    quickTip: "登録ユーザーの一覧と権限管理を行います。",
  },
  "/admin/settings": {
    moduleId: "admin",
    topicId: "system-settings",
    quickTip: "アプリケーション全体の設定を管理します。",
  },
};

// ─── Utility: filter help content by user role ───

export function filterHelpByRole(modules: HelpModule[], userRole: string): HelpModule[] {
  const roleLevel = (role: string) => {
    if (role === "admin") return 3;
    if (role === "group_leader") return 2;
    return 1;
  };

  const userLevel = roleLevel(userRole);

  const filterTopics = (topics: HelpTopic[]): HelpTopic[] => {
    return topics
      .filter((topic) => {
        if (!topic.requiredRole) return true;
        return userLevel >= roleLevel(topic.requiredRole);
      })
      .map((topic) => ({
        ...topic,
        children: topic.children ? filterTopics(topic.children) : undefined,
      }));
  };

  return modules
    .filter((mod) => {
      if (!mod.requiredRole) return true;
      return userLevel >= roleLevel(mod.requiredRole);
    })
    .map((mod) => ({
      ...mod,
      topics: filterTopics(mod.topics),
    }));
}

// ─── Tutorial integration point ───

/**
 * Tutorial registry for future interactive tutorial system.
 * Implementations should register tutorial definitions here,
 * keyed by the tutorialId used in HelpTopic.
 *
 * Example future usage:
 *   registerTutorial("curriculum-setup-flow", {
 *     steps: [
 *       { target: ".schema-tab-departments", content: "まず学科を登録します" },
 *       { target: ".add-department-btn", content: "ここをクリックして追加" },
 *     ],
 *   });
 */
export interface TutorialDefinition {
  steps: Array<{
    /** CSS selector for the target element to highlight */
    target: string;
    /** Instruction text */
    content: string;
    /** Optional action to wait for before proceeding */
    waitForAction?: string;
  }>;
}

const tutorialRegistry = new Map<string, TutorialDefinition>();

export function registerTutorial(id: string, definition: TutorialDefinition): void {
  tutorialRegistry.set(id, definition);
}

export function getTutorial(id: string): TutorialDefinition | undefined {
  return tutorialRegistry.get(id);
}

export function hasTutorial(id: string): boolean {
  return tutorialRegistry.has(id);
}
