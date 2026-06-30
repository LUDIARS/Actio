# 不足機能評価 — Actio (2026-05-23)

## 1. 機能改善提案

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| Task 一覧 | 優先度/ステータスでのフィルター UI を Corpus declarative panel に追加 | Corpus hub からのタスク検索効率向上 | High |
| Task notification | タスク更新時の Nuntius push (完了/期限切れ/assign) を統一実装 | task awareness 向上 (Task.notifyMinutesBefore 既実装と整合) | High |
| Dashboard | calendar 中心 → task 中心へ再設計 (split-task-only-phase-2) | UI coherence | High |
| Group rate limit | group 単位 API quota | マルチtenant のリソース割当制御 | Medium |
| Task 依存/blocking | task A が task B を block (Notion/GitHub Issues 類似) | プロジェクト管理 criticality 向上 | Medium |

## 2. 不足機能提案

| 提案機能 | 必要性 | 優先度 | 影響範囲 |
|---------|--------|--------|---------|
| npm audit / SAST CI 統合 | CVE 自動検知 | High | .github/workflows/test.yml |
| /.well-known/health endpoint | k8s/container orchestration | High | src/app.ts に route 追加 |
| TypeScript strict 強化 (any 12箇所) | 型安全強化 | Medium | src/**/*.ts review |
| Calendar/Events page dead code 整理 | split-task-only-phase-2 | Medium | frontend/src/pages/ |
