// @spec スプリントフェーズの永続化と復旧
import type { SqliteDatabase } from "./dialects/sqlite.js";
import type { PlanningPostgres } from "./planning-postgres.js";
import type { GateDatabase, Program } from "../../modules/task/sprint-gates/query.js";
/** SQLite's transaction callback must never await: each yielded query completes synchronously. */
export function sqliteGateDatabase(db: SqliteDatabase): GateDatabase {
    return { timestamp: now => Math.floor(now.getTime() / 1000), async transaction<T>(_teamId: string, work: () => Program<T>): Promise<T> {
            return db.transaction(() => {
                const program = work();
                let step = program.next();
                while (!step.done) {
                    const q = step.value;
                    const statement = db.prepare(q.sql);
                    step = program.next(q.mode === "one" ? statement.get(...q.args) : q.mode === "all" ? statement.all(...q.args) : statement.run(...q.args));
                }
                return step.value;
            }).immediate();
        } };
}
export function postgresGateDatabase(db: PlanningPostgres): GateDatabase {
    return { timestamp: now => db.timestamp(now), transaction<T>(teamId: string, work: () => Program<T>, options?: {
            lockTasks: boolean;
        }): Promise<T> {
            return db.transaction(async () => {
                // Full-scope evidence must exclude task insert/move phantoms as well as row edits.
                // The short transaction performs DB work only and never waits for network I/O.
                if (options?.lockTasks !== false)
                    await db.prepare("LOCK TABLE tasks IN SHARE ROW EXCLUSIVE MODE").run();
                const program = work();
                let step = program.next();
                while (!step.done) {
                    const q = step.value;
                    const statement = db.prepare(q.sql);
                    step = program.next(await (q.mode === "one" ? statement.get(...q.args) : q.mode === "all" ? statement.all(...q.args) : statement.run(...q.args)));
                }
                return step.value;
            }, teamId);
        } };
}
