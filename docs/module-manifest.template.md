# {モジュール名} — Module Manifest

```yaml
# ── メタ情報 ──
moduleId: "{module-id}"
name: "{モジュール名}"
description: "{モジュールの概要}"
version: "0.1.0"
```

## 依存関係

```yaml
dependencies:
  - moduleId: "{依存先モジュールID}"
    type: required          # required | optional | event
    reason: "{なぜ必要か}"
    usesEntities:
      - "{エンティティ名}"
    subscribesTo:
      - "{イベント名}"
    usesEndpoints:
      - "{GET /api/...}"

exports:
  - name: "{公開名}"
    type: entity            # entity | event | operation | plugin
    description: "{説明}"
```

---

## 1. UI 表現

### 1.1 メニュー階層

```yaml
menu:
  groups:
    - groupId: "{MenuGroup.id}"
      style: default        # default | flat | compact | highlighted
      items:
        - path: "/{ページパス}"
          variant: link     # link | action | external | divider
          badge:
            type: dot       # count | dot | text
            color: accent   # default | accent | warning | danger | success
          tooltip: "{ツールチップ}"
      dividerAfter:
        - "/{区切り線を入れるパスの後}"
```

### 1.2 ページレイアウト

```yaml
pages:
  - path: "/{ページパス}"

    size:
      width: fluid          # fluid | constrained | fixed
      # maxWidth: 1200
      # minWidth: 320
      height: auto          # auto | viewport | fixed
      # fixedHeight: 600
      resizable: false

    layout:
      type: single-column   # single-column | two-column | grid | tabs | split
      # ratio: [3, 1]       # two-column / split 時
      # columns: 3          # grid 時 (数値 or "auto-fill")
      # splitDirection: horizontal  # split 時
      blocks:
        - id: "{ブロックID}"
          contentType: table # table | form | card-grid | calendar | timetable
                             # chart | stat | list | detail | empty-state | custom
          size: full         # small | medium | large | full
          # area: main       # main | side | header | footer (two-column/split時)
          # colSpan: 2       # grid 時
          # rowSpan: 1       # grid 時
          # collapsible: true
          # defaultCollapsed: false
          # resizable: false

      # tabs 時:
      # tabs:
      #   - id: "{タブID}"
      #     label: "{タブラベル}"
      #     blocks:
      #       - id: "{ブロックID}"
      #         contentType: table

    density: normal         # compact | normal | comfortable

    responsive:
      - breakpoint: mobile  # mobile | tablet | desktop
        layout:
          type: single-column
        hiddenBlocks:
          - "{非表示ブロックID}"
        density: compact
```

---

## 2. ドメインモデル

### 2.1 エンティティ

```yaml
entities:
  - name: "{エンティティ名}"           # PascalCase
    description: "{説明}"
    identityField: id                  # デフォルト: "id"
    identityStrategy: uuid             # uuid | auto-increment | natural | composite

    fields:
      - name: "{フィールド名}"
        type: string                   # string | number | boolean | date | datetime
                                       # uuid | enum | json | array
        # itemType: "{要素型}"         # array / enum の場合
        nullable: false
        hasDefault: false
        description: "{説明}"
        validation:
          - type: required             # required | min | max | pattern | enum | unique | custom
            # param: 1
            severity: error            # error | warning
            # message: "{エラーメッセージ}"

    invariants:
      - id: "{ルールID}"
        description: "{自然言語でのビジネスルール}"
        fields: ["{関連フィールド}"]
        severity: error
```

### 2.2 値オブジェクト

```yaml
valueObjects:
  - name: "{値オブジェクト名}"
    description: "{説明}"
    fields:
      - name: "{フィールド名}"
        type: string
```

### 2.3 集約

```yaml
aggregates:
  - root: "{集約ルートのエンティティ名}"
    children:
      - "{子エンティティ名}"
    description: "{集約の説明}"
```

### 2.4 リレーション

```yaml
relationships:
  - name: "{リレーション名}"
    from: "{参照元エンティティ}"
    to: "{参照先エンティティ}"
    cardinality: "1:N"                 # 1:1 | 1:N | N:1 | M:N
    # junctionEntity: "{中間テーブル}" # M:N の場合
    foreignKey: "{外部キーフィールド}"
    onDelete: cascade                  # cascade | set-null | restrict | no-action
    required: true
```

### 2.5 ステートマシン

```yaml
stateMachines:
  - entity: "{エンティティ名}"
    field: status
    states: ["{状態1}", "{状態2}", "{状態3}"]
    initial: "{初期状態}"
    terminal: ["{終了状態}"]
    transitions:
      - from: "{遷移元}"
        to: "{遷移先}"
        trigger: "{アクション名}"
        # guard: "{前提条件}"
```

### 2.6 ドメインイベント

```yaml
events:
  - name: "{module}.{entity}.{action}"  # ドット区切り
    description: "{説明}"
    source: "{発行元エンティティ}"
    payload:
      - name: "{フィールド名}"
        type: string
```

### 2.7 操作 (コマンド / クエリ)

```yaml
operations:
  - name: "{操作名}"                    # camelCase
    type: command                       # command | query
    description: "{説明}"
    input:
      - name: "{パラメータ名}"
        type: string
        required: true
    output: "{エンティティ名 or 値オブジェクト名}"
    outputArray: false
    # requiredRole: admin
    emitsEvents:
      - "{イベント名}"
```

---

## 3. DB スキーマ

```yaml
schemaFile: "src/db/schema.ts"

tables:
  - name: "{テーブル名}"               # snake_case
    description: "{説明}"
    domainEntity: "{対応エンティティ名}"
    # isJunction: false                 # M:N 中間テーブルの場合 true

    columns:
      - name: "{カラム名}"
        type: text                     # text | integer | real | boolean
                                       # timestamp | date | json | blob
        primaryKey: false
        notNull: true
        unique: false
        # defaultDescription: "UUID v4"
        # jsonShape: array             # array | object | array-of-objects | unknown
        # jsonElementType: "string[]"
        description: "{説明}"

    foreignKeys:
      - column: "{外部キーカラム}"
        referencesTable: "{参照先テーブル}"
        referencesColumn: id
        onDelete: cascade              # cascade | set null | restrict | no action

    indexes:
      - name: "{インデックス名}"
        columns: ["{カラム名}"]
        unique: false
        description: "{なぜ必要か}"

    compositeConstraints:
      - name: "{制約名}"
        type: unique                   # unique | primary-key | check
        columns: ["{カラム1}", "{カラム2}"]
        # checkExpression: "{条件}"

migrationHints:
  - table: "{テーブル名}"
    type: add-column                   # add-table | add-column | modify-column
                                       # drop-column | add-index | add-fk
    description: "{変更の説明}"
    breaking: false
    requiresDataMigration: false
```

---

## 4. API コントラクト

```yaml
basePath: "/api/{module}"

endpoints:
  - method: GET                        # GET | POST | PUT | PATCH | DELETE
    path: "/api/{module}/{resource}"
    description: "{説明}"
    authRequired: true
    # requiredRole: admin
    # domainOperation: "{操作名}"

    params:
      - name: "{パラメータ名}"
        in: query                      # path | query | body | header
        type: string
        required: false
        description: "{説明}"

    responses:
      - status: 200
        type: "{エンティティ名}"
        array: true
        description: "{説明}"
      - status: 404
        description: "Not found"
```

---

## 備考

<!-- 自由記述: 設計上の決定事項、トレードオフ、将来の構想など -->
