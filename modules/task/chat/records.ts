// @implements AT-SPRINT-CHAT-INTEGRATION
import { all, one, exec, type Program, type GateDatabase } from "../sprint-gates/query.js";
import { ChatError } from "./contracts.js";

export function* readRecord<T>(team: string, kind: string, id: string): Program<T | null> {
  const row = yield* one<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind=? AND id=?", team, kind, id);
  return row ? JSON.parse(row.body) as T : null;
}
export function* writeRecord<T>(team: string, kind: string, id: string, value: T, now: Date, state = "saved", revision = 1): Program<void> {
  yield* exec(`INSERT INTO task_chat_records(team_id,kind,id,state,revision,body,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(team_id,kind,id) DO UPDATE SET state=excluded.state,revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at`,
  team, kind, id, state, revision, JSON.stringify(value), now.toISOString());
}
export class ChatRecords {
  constructor(readonly database: GateDatabase) {}
  transaction<T>(team: string, work: () => Program<T>): Promise<T> {
    return this.database.transaction(team, work, { lockTasks: false });
  }
  get<T>(team: string, kind: string, id: string): Promise<T | null> {
    return this.transaction(team, function* () { return yield* readRecord<T>(team, kind, id); });
  }
  list<T>(team: string, kind: string, limit = 100, offset = 0): Promise<T[]> {
    return this.transaction(team, function* () {
      const rows = yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind=? ORDER BY updated_at DESC,id LIMIT ? OFFSET ?", team, kind, Math.min(limit, 200), offset);
      return rows.map(row => JSON.parse(row.body) as T);
    });
  }
  allOfKind<T>(kind: string): Promise<T[]> {
    return this.transaction("chat-catalog", function* () {
      return (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE kind=? ORDER BY team_id,id", kind)).map(row => JSON.parse(row.body) as T);
    });
  }
  allForTeam<T>(team: string, kind: string): Promise<T[]> {
    return this.transaction(team, function* () {
      return (yield* all<{ body: string }>("SELECT body FROM task_chat_records WHERE team_id=? AND kind=? ORDER BY id", team, kind)).map(row => JSON.parse(row.body) as T);
    });
  }
  save<T>(team: string, kind: string, id: string, value: T, now: Date, state?: string): Promise<void> {
    return this.transaction(team, function* () { yield* writeRecord(team, kind, id, value, now, state); });
  }
  /** A lost lease stops a worker before its next external operation. */
  lease(owner: string, now: Date, durationMs: number): Promise<boolean> {
    return this.transaction("chat-runtime", function* () {
      const previous = yield* one<{ owner: string; expires_at: string }>("SELECT owner,expires_at FROM task_chat_lease WHERE id='runtime'");
      if (previous && previous.owner !== owner && previous.expires_at > now.toISOString()) return false;
      yield* exec("INSERT INTO task_chat_lease(id,owner,expires_at) VALUES('runtime',?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at", owner, new Date(now.getTime() + durationMs).toISOString());
      return true;
    });
  }
  releaseLease(owner: string): Promise<void> {
    return this.transaction("chat-runtime", function* () { yield* exec("DELETE FROM task_chat_lease WHERE id='runtime' AND owner=?", owner); });
  }
}
export function requireRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new ChatError("内容が更新されています。再読み込みして確認してください");
}
