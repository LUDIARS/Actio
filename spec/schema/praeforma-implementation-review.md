# Pf 実装確認の永続化

既存タスクへ破壊的変更を加えず、SQLite/PostgreSQL 共通の追加テーブルで管理する。

| テーブル | 主キー・用途 |
|---|---|
| pf_implementation_links | team_id/project_id/subject_kind/subject_id/task_id。対象タスク、確認した仕様 fingerprint、追加残件のフラグ、関連付け者・理由・日時 |
| pf_implementation_task_versions | task_id。対象タスクの単調増加する変更番号 |
| pf_implementation_reviews | id。対象・fingerprint・確認者・理由・確認日時。対象と fingerprint の組を unique にする |

確認履歴は追記する。タスクの状態を別テーブルへ複製しない。
タスクの status/title/description/requirements/team_id の変更と削除を DB trigger で検知する。
期限や工数の再計算だけでは確認を無効にしない。同一秒内の再開→完了でも変更番号が増えるため過去の確認は復活しない。
削除タスクのリンクと履歴は残し、読み取り時に missing と表示する。自動の完了扱いを防ぐため cascade delete しない。
個人データは Cernere の利用者 ID のみ。資格情報はこれらのテーブルに格納しない。
日時は ISO 8601 UTC。バックログのタスク日時だけは既存 dialect の保存形式を使う。
DDL は `src/db/implementation-migration.ts`。通常起動・db:init の既存 planning migration から冪等に適用する。
