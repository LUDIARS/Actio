import { AsyncLocalStorage } from "node:async_hooks";
import type postgres from "postgres";

/** Pf's transaction-scoped persistence pattern, using Actio's existing postgres.js pool. */
export class PlanningPostgres {
  private readonly scope = new AsyncLocalStorage<postgres.TransactionSql>();
  constructor(private readonly pool: postgres.Sql) {}

  timestamp(date: Date): string { return date.toISOString(); }

  async transaction<T>(work: () => Promise<T>, teamId: string): Promise<T> {
    let result: T | undefined;
    await this.pool.begin(async sql => {
      // Serializes planning mutations even when no sprint/task exists yet.
      await sql.unsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`actio-planning:${teamId}`]);
      result = await this.scope.run(sql, work);
    });
    return result as T;
  }

  prepare(source: string) {
    let index = 0;
    let query = source.replace(/\?/g, () => `$${++index}`)
      .replace(/\bAS ([a-z][A-Za-z]*[A-Z][A-Za-z]*)\b/g, 'AS "$1"');
    // Row locks also protect against ordinary task updates outside planning APIs.
    if (this.scope.getStore() && /^SELECT\b/i.test(query.trim()) && /\bFROM tasks\b/i.test(query)) {
      query += /FROM tasks t\b/.test(query) ? " FOR UPDATE OF t" : " FOR UPDATE";
    }
    const rows = async (parameters: unknown[]): Promise<Record<string, unknown>[]> => {
      const args = parameters.map(value => {
        if (value === null || typeof value === "string" || typeof value === "number") return value;
        throw new Error("Invalid planning SQL parameter");
      });
      const sql = this.scope.getStore() ?? this.pool;
      const result = await sql.unsafe(query, args);
      return result.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, value instanceof Date ? Math.floor(value.getTime() / 1000) : value])));
    };
    return {
      all: (...args: unknown[]): Promise<unknown[]> => rows(args),
      get: async (...args: unknown[]): Promise<unknown> => (await rows(args))[0],
      run: async (...args: unknown[]): Promise<void> => { await rows(args); },
    };
  }
}
