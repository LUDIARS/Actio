# PM（プロジェクト管理）仕様

## 概要

GitHub Issues / Notion Database と双方向同期し、タスク管理・分析を行う M2 モジュール。差分検知・コンフリクト解決・タスク検証・クリティカルパス分析・ゴンペルツ曲線によるバグ収束予測を提供する。

## 機能要件

### 外部ソース接続

- **GitHub**: owner/repo + Personal Access Token で接続
- **Notion**: Database ID + Integration Token で接続

### 双方向同期

- **Pull**: 外部ソース → Schedula（定期実行）
- **Push**: Schedula → 外部ソース（手動 or 変更検知時）
- 同期間隔: プロジェクト設定で指定（default: 15分）

### 差分検知 & コンフリクト解決

- タスクの変更フィールドと before/after を検出
- コンフリクト解決戦略: `auto_field_merge` / `claude_merge` / `force_external` / `manual`

### タスク検証

- タスク内容の充実度スコア算出
- 問題検出（型: type, 内容: message, 重要度: severity）
- 改善提案リスト生成

### 分析機能

- **クリティカルパス分析**: タスク依存関係からクリティカルパスを算出
- **タスク分解推奨**: 見積もり時間が大きいタスクの分解提案
- **ゴンペルツ曲線**: バグ収束予測（累積バグ数の推移を予測）

### リマインダー

- 納期警告（期限前通知）
- 超過通知（期限超過タスクの警告）
