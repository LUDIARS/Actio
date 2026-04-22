/**
 * Module-scoped Drizzle proxy — Issue #111 S3
 *
 * 以前は `ctx.db.raw = db` で Drizzle インスタンスを素通ししていたため、
 * プラグインが `db.select().from(users)` のようにコア/他モジュールの
 * 任意テーブルへ無制限にアクセスできた。
 *
 * 修正: プラグインが `definition.tables` で**宣言したテーブルだけ**に
 * アクセス可能な Proxy を返す。宣言外のテーブルに触れた時点で throw.
 *
 * ## 実装範囲
 *
 * - `insert(t)` / `update(t)` / `delete(t)` — 第一引数を即検証
 * - `select(...).from(t)` — `from` でも検証 (select builder をラップ)
 * - `execute(sql)` / `transaction(fn)` — 素通し (SQL テンプレート
 *   経由の raw アクセスは検知困難なため、本番では module 毎に
 *   読み取り専用 DB role を割り当てる Phase 2 の方針でカバー)
 *
 * 宣言テーブルが **空** の場合は CRUD すべて禁止 (`tables` を持たない
 * 旧モジュールは DbApi を使わないのが前提)。
 */

export class DbScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbScopeError";
  }
}

interface TableLike {
  readonly _?: { name?: string };
}

function tableName(t: unknown): string {
  if (t && typeof t === "object" && "_" in t) {
    const meta = (t as TableLike)._;
    if (meta && typeof meta.name === "string") return meta.name;
  }
  return "<unknown>";
}

function assertAllowed(
  allowedTables: ReadonlySet<unknown>,
  moduleId: string,
  verb: string,
  t: unknown,
): void {
  if (allowedTables.size === 0) {
    throw new DbScopeError(
      `[plugin ${moduleId}] ${verb}: module declares no tables — DB access is closed.`,
    );
  }
  if (!allowedTables.has(t)) {
    throw new DbScopeError(
      `[plugin ${moduleId}] ${verb} on table "${tableName(t)}" is not in the module's declared tables. ` +
      `Declare it via defineModule({ tables: { ... } }).`,
    );
  }
}

/** 最低限 Drizzle のトップレベル API を模したダック型 */
interface DrizzleLike {
  select?:      (...a: unknown[]) => unknown;
  selectDistinct?: (...a: unknown[]) => unknown;
  insert?:      (t: unknown, ...a: unknown[]) => unknown;
  update?:      (t: unknown, ...a: unknown[]) => unknown;
  delete?:      (t: unknown, ...a: unknown[]) => unknown;
  transaction?: (fn: unknown, ...a: unknown[]) => unknown;
  execute?:     (...a: unknown[]) => unknown;
  [k: string]:  unknown;
}

/**
 * `realDb` をラップし、`allowedTables` 外へのアクセスを拒否する。
 *
 * 戻り値は元 `realDb` と同じ API 面を持つが、insert/update/delete/select
 * の入口だけ検証が追加される。モジュール作者は「普通に Drizzle を
 * 使う」だけで宣言外アクセスが例外になる。
 */
export function makeScopedDb(
  realDb: unknown,
  moduleId: string,
  allowedTables: Iterable<unknown>,
): unknown {
  const allowSet = new Set<unknown>(allowedTables);
  const d = realDb as DrizzleLike;

  function guardedMutate(verb: "insert" | "update" | "delete") {
    return (t: unknown, ...rest: unknown[]) => {
      assertAllowed(allowSet, moduleId, verb, t);
      const fn = d[verb] as ((x: unknown, ...r: unknown[]) => unknown) | undefined;
      if (!fn) throw new DbScopeError(`underlying db has no .${verb}()`);
      return fn.call(d, t, ...rest);
    };
  }

  function wrapSelect(verb: "select" | "selectDistinct") {
    return (...selectArgs: unknown[]) => {
      const fn = d[verb] as ((...a: unknown[]) => unknown) | undefined;
      if (!fn) throw new DbScopeError(`underlying db has no .${verb}()`);
      const builder = fn.call(d, ...selectArgs) as Record<string, unknown>;
      // `.from()` をラップ. 他のメソッドは素通し.
      const wrapped: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(builder)) {
        const v = (builder as Record<string | symbol, unknown>)[key as string];
        if (typeof v === "function") {
          wrapped[key as string] = v;   // 既定は素通し
        } else {
          wrapped[key as string] = v;
        }
      }
      // Proxy で動的メソッドも捕捉 (Drizzle の builder は内部的に
      // hidden props を持つためプロト経由).
      return new Proxy(builder, {
        get(target, prop, receiver) {
          const val = Reflect.get(target, prop, receiver);
          if (prop === "from" && typeof val === "function") {
            return (t: unknown, ...rest: unknown[]) => {
              assertAllowed(allowSet, moduleId, `${verb}.from`, t);
              return (val as Function).call(target, t, ...rest);
            };
          }
          return val;
        },
      });
    };
  }

  const proxy: DrizzleLike = Object.create(realDb as object);
  proxy.select         = d.select         ? wrapSelect("select")         : proxy.select;
  proxy.selectDistinct = d.selectDistinct ? wrapSelect("selectDistinct") : proxy.selectDistinct;
  proxy.insert         = d.insert         ? guardedMutate("insert")      : proxy.insert;
  proxy.update         = d.update         ? guardedMutate("update")      : proxy.update;
  proxy.delete         = d.delete         ? guardedMutate("delete")      : proxy.delete;
  // transaction / execute はそのまま (cf. モジュール docstring).
  if (d.transaction) proxy.transaction = d.transaction.bind(d);
  if (d.execute)     proxy.execute     = d.execute.bind(d);

  return proxy;
}
