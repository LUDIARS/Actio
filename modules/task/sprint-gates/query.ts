// @spec スプリントフェーズの永続化と復旧
/** SQL effects are interpreted synchronously for SQLite, asynchronously for PostgreSQL. */
export interface Query {
    sql: string;
    args: (string | number | null)[];
    mode: "one" | "all" | "run";
}
export type Program<T> = Generator<Query, T, unknown>;
export function* one<T>(sql: string, ...args: Query["args"]): Program<T | undefined> { return (yield { sql, args, mode: "one" }) as T | undefined; }
export function* all<T>(sql: string, ...args: Query["args"]): Program<T[]> { return (yield { sql, args, mode: "all" }) as T[]; }
export function* exec(sql: string, ...args: Query["args"]): Program<void> { yield { sql, args, mode: "run" }; }
export interface GateDatabase {
    transaction<T>(teamId: string, work: () => Program<T>, options?: {
        lockTasks: boolean;
    }): Promise<T>;
    timestamp(date: Date): number | string;
}
