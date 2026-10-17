import { useState, type FormEvent } from "react";
import { EMPTY_TASK_SEARCH, type TaskSearchValues } from "../lib/task-search";

/**
 * タスク一覧の検索 (q)・カテゴリ・担当の絞り込み。
 * 文字入力は「検索」で確定してから一覧を引き直す (1 文字ごとに API を呼ばない)。
 */
export function TaskSearchFilters({ value, categories, onChange }: {
  value: TaskSearchValues;
  categories: string[];
  onChange: (next: TaskSearchValues) => void;
}) {
  // 条件は常にこの部品から変わるので、 入力中の値は自前で持つ
  const [draft, setDraft] = useState(value);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onChange({ q: draft.q.trim(), category: draft.category, assignee: draft.assignee.trim() });
  };
  const active = value.q !== "" || value.category !== "" || value.assignee !== "";

  return (
    <form className="tasks-filter-row tasks-search" role="search" aria-label="タスク検索" onSubmit={submit}>
      <span className="tasks-filter-label">検索</span>
      <input
        type="search"
        aria-label="タイトルで検索"
        placeholder="タイトルで検索"
        value={draft.q}
        onChange={(e) => setDraft({ ...draft, q: e.target.value })}
      />
      <select
        aria-label="カテゴリ"
        value={draft.category}
        onChange={(e) => {
          const next = { ...draft, category: e.target.value };
          setDraft(next);
          onChange({ ...value, category: next.category });
        }}
      >
        <option value="">全カテゴリ</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input
        type="text"
        aria-label="担当 (ユーザ ID)"
        placeholder="担当 (ユーザ ID)"
        value={draft.assignee}
        onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
      />
      <button type="submit">検索</button>
      {active && (
        <button type="button" onClick={() => { setDraft(EMPTY_TASK_SEARCH); onChange(EMPTY_TASK_SEARCH); }}>
          条件をクリア
        </button>
      )}
    </form>
  );
}
