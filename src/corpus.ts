// Corpus 連携 — サービスマニフェスト + 宣言的 UI descriptor。
//
// Corpus (LUDIARS の hub) は GET /.well-known/corpus-service.json を読み、
// declarative panel の descriptor を内蔵レンダラで描く (Corpus DESIGN.md §13)。
// Actio 自前 frontend はこれと別に当面残す (本マニフェスト追加は非破壊)。

// ── マニフェスト型 (Corpus server/hub/manifest.ts のミラー + §13) ──────────

interface ManifestDataEndpoint {
  id: string;
  /** サービス内のパス。 :param を含めてよい。 */
  path: string;
  scope: "local" | "multi";
  title?: string;
}

interface ActionDescriptor {
  label: string;
  dataId: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Record<string, string>;
  body?: Record<string, string>;
  confirm?: string;
  success?: string;
  requires?: "admin";
}

interface FormField {
  name: string;
  label: string;
  input: "text" | "textarea" | "number" | "select" | "datetime" | "date" | "checkbox";
  required?: boolean;
  maxLength?: number;
  /** 静的選択肢 (固定 enum)。 */
  options?: { label: string; value: string }[];
}

interface FormComponent {
  type: "form";
  submit: { dataId: string; method: "POST" | "PATCH"; success?: string };
  fields: FormField[];
}

interface ListComponent {
  type: "list";
  dataSource: string;
  itemsPath?: string;
  itemKey: string;
  empty?: string;
  item: {
    title: string;
    subtitle?: string;
    body?: string;
    meta?: string;
    actions?: ActionDescriptor[];
    edit?: {
      dataId: string;
      method: "PUT" | "PATCH";
      params?: Record<string, string>;
      success?: string;
      fields: FormField[];
    };
  };
}

type ComponentDescriptor = FormComponent | ListComponent;

interface SectionDescriptor {
  title?: string;
  components: ComponentDescriptor[];
}

interface PanelDescriptor {
  descriptorVersion: 1;
  title: string;
  sections: SectionDescriptor[];
}

interface DeclarativePanel {
  id: string;
  kind: "declarative";
  title: string;
  icon?: string;
  ui: PanelDescriptor;
}

export interface CorpusServiceManifest {
  service: string;
  displayName: string;
  version: string;
  corpusApi: number;
  health: string;
  auth: string;
  cernereProjectKey?: string;
  data: ManifestDataEndpoint[];
  panels: DeclarativePanel[];
}

// ── 共通: タスクの status / priority 選択肢 ────────────────────────────────

const STATUS_OPTIONS = [
  { label: "未着手", value: "open" },
  { label: "進行中", value: "in_progress" },
  { label: "ブロック", value: "blocked" },
  { label: "完了", value: "done" },
  { label: "キャンセル", value: "cancelled" },
];

const PRIORITY_OPTIONS = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];

// ── タスクパネルの UI descriptor ────────────────────────────────────────────

const taskPanel: PanelDescriptor = {
  descriptorVersion: 1,
  title: "タスク",
  sections: [
    {
      title: "新規タスク",
      components: [
        {
          type: "form",
          submit: { dataId: "tasks", method: "POST", success: "タスクを作成しました" },
          fields: [
            { name: "title", label: "タイトル", input: "text", required: true, maxLength: 200 },
            { name: "description", label: "詳細", input: "textarea" },
            { name: "priority", label: "優先度", input: "select", options: PRIORITY_OPTIONS },
            { name: "deadline", label: "期限", input: "datetime" },
          ],
        },
      ],
    },
    {
      title: "タスク一覧",
      components: [
        {
          type: "list",
          dataSource: "tasks",
          itemsPath: "tasks",
          itemKey: "id",
          empty: "タスクはありません",
          item: {
            title: "{title}",
            subtitle: "{status} ・ 優先度 {priority}",
            body: "{description}",
            meta: "{deadline|datetime}",
            actions: [
              {
                label: "削除",
                dataId: "task",
                method: "DELETE",
                params: { id: "{id}" },
                confirm: "このタスクを削除しますか?",
                success: "削除しました",
              },
            ],
            edit: {
              dataId: "task",
              method: "PUT",
              params: { id: "{id}" },
              success: "更新しました",
              fields: [
                { name: "title", label: "タイトル", input: "text", required: true },
                { name: "description", label: "詳細", input: "textarea" },
                { name: "status", label: "状態", input: "select", options: STATUS_OPTIONS },
                { name: "priority", label: "優先度", input: "select", options: PRIORITY_OPTIONS },
                { name: "deadline", label: "期限", input: "datetime" },
              ],
            },
          },
        },
      ],
    },
  ],
};

// ── サービスマニフェスト ────────────────────────────────────────────────────

export const CORPUS_MANIFEST_PATH = "/.well-known/corpus-service.json";

export const corpusManifest: CorpusServiceManifest = {
  service: "actio",
  displayName: "Actio タスク管理",
  version: "1.0.0",
  corpusApi: 2,
  health: "/api/health",
  auth: "cernere-project-token",
  cernereProjectKey: "actio",
  data: [
    { id: "tasks", path: "/api/tasks", scope: "local", title: "タスク" },
    { id: "task", path: "/api/tasks/:id", scope: "local", title: "タスク (個別)" },
  ],
  panels: [
    {
      id: "tasks",
      kind: "declarative",
      title: "タスク",
      icon: "✓",
      ui: taskPanel,
    },
  ],
};
