---
task: unassigned-task-intake
project: Actio
kind: implementation
created: 2026-09-27
memory_links: []
---

# チーム未登録タスクの一時登録

利用者指示: 既存のチーム所属は登録元から同期し、複数所属を維持する。個別プロジェクトの登録データは管理サービスを正本とし、この文書には含めない。

チーム未登録でもタスク登録が必要な場合、既存のカンマ区切りカテゴリ・タグ機構を使い「一時登録」「要整理」を付ける。元の分類・本文・プロジェクト参照・作成元参照は保持する。要整理タグは画面で強調表示する。

対象はチーム未指定で、Cc同期済みプロジェクトに有効な所属がないタスク、または Cc workflow v3 由来でプロジェクト登録が未解決のタスク。通常の個人タスク・外部プロジェクト参照は変更しない。明示されたチームの認可・所属検証は緩和しない。

既存タスクの再送は既存IDを返す。分類の解除は整理担当者の編集で行う。

調査根拠: task-integration §6、team-task、Anatomia actio plan (deterministic hash 6d11ba5be4898cec)、modules/task/team/cc-sync.ts、cc-project-parse.ts。複数所属は既存 teamIds 配列で保持済み。
