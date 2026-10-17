import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi, type TaskListQuery } from "../lib/api";
import type { CoreTaskSummary } from "../lib/api-types";

/**
 * GET /api/tasks の要約一覧をページ単位で読む (spec/feature/task-list-api.md)。
 * 条件が変わると先頭ページから読み直し、 loadMore で nextCursor の続きを足す。
 * 古い条件の応答が後から届いても捨てる。
 */
export function useTaskListPages(query: Omit<TaskListQuery, "cursor">, onError: (message: string) => void) {
  const [tasks, setTasks] = useState<CoreTaskSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const queryKey = JSON.stringify(query);

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const res = await tasksApi.list(JSON.parse(queryKey) as TaskListQuery);
      if (current !== generation.current) return;
      setTasks(res.tasks);
      setNextCursor(res.nextCursor ?? null);
    } catch (e: unknown) {
      if (current === generation.current) onError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
    // onError は呼び出し側で毎回作られるため依存に入れない (条件の変化だけで読み直す)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const current = generation.current;
    setLoading(true);
    try {
      const res = await tasksApi.list({ ...(JSON.parse(queryKey) as TaskListQuery), cursor: nextCursor });
      if (current !== generation.current) return;
      setTasks((previous) => [...previous, ...res.tasks.filter((t) => !previous.some((p) => p.id === t.id))]);
      setNextCursor(res.nextCursor ?? null);
    } catch (e: unknown) {
      if (current === generation.current) onError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, nextCursor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tasks, nextCursor, loading, reload, loadMore };
}
