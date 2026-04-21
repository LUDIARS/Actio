/**
 * Issue #111 S9 — 軽量 semver range チェッカ
 *
 * 外部依存 (`semver` npm) を持ち込まず、プラグイン宣言に現れる範囲式
 * (caret `^1.2.3`, tilde `~1.2.3`, 完全一致、>=/<=) を最低限サポートする.
 * 完全な semver サブセットではない点を意図的に受け入れる — プラグイン
 * 作者は SDK バージョンに合わせた狭い宣言を使う想定.
 *
 * Supported forms:
 *   - `1.2.3`         (exact)
 *   - `^1.2.3`        (compatible, same major; 0.x は minor 固定)
 *   - `~1.2.3`        (patch-only; same major.minor)
 *   - `>=1.2.3`, `<=1.2.3`, `>1.2.3`, `<1.2.3`
 *   - `*` / `""`      (always match)
 *   - `a || b`        (OR composition)
 *   - `>=1.2.3 <2.0.0` (AND composition by whitespace)
 */

/** ホストが実装している SDK API のバージョン. プラグイン側の
 *  `schedulaApiVersion` 範囲式に対してこれが matches するか判定する. */
export const HOST_SCHEDULA_API_VERSION = "1.0.0";

type Triple = [number, number, number];

function parseVersion(raw: string): Triple | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(raw.trim());
  if (!m) return null;
  return [Number(m[1]!), Number(m[2]!), Number(m[3]!)];
}

function cmp(a: Triple, b: Triple): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

type Constraint = (v: Triple) => boolean;

function exactly(t: Triple): Constraint {
  return (v) => cmp(v, t) === 0;
}

function caret(t: Triple): Constraint {
  // ^1.2.3 := >=1.2.3 <2.0.0
  // ^0.2.3 := >=0.2.3 <0.3.0
  // ^0.0.3 := >=0.0.3 <0.0.4
  let upper: Triple;
  if (t[0] > 0)      upper = [t[0] + 1, 0, 0];
  else if (t[1] > 0) upper = [0, t[1] + 1, 0];
  else               upper = [0, 0, t[2] + 1];
  return (v) => cmp(v, t) >= 0 && cmp(v, upper) < 0;
}

function tilde(t: Triple): Constraint {
  // ~1.2.3 := >=1.2.3 <1.3.0
  const upper: Triple = [t[0], t[1] + 1, 0];
  return (v) => cmp(v, t) >= 0 && cmp(v, upper) < 0;
}

function compileClause(raw: string): Constraint {
  const clause = raw.trim();
  if (clause === "" || clause === "*") return () => true;

  if (clause.startsWith("^")) {
    const t = parseVersion(clause.slice(1));
    if (!t) throw new Error(`invalid caret range: ${raw}`);
    return caret(t);
  }
  if (clause.startsWith("~")) {
    const t = parseVersion(clause.slice(1));
    if (!t) throw new Error(`invalid tilde range: ${raw}`);
    return tilde(t);
  }

  const opMatch = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(clause);
  if (!opMatch) throw new Error(`invalid range: ${raw}`);
  const op  = opMatch[1] ?? "=";
  const verTxt = opMatch[2]!;
  const t = parseVersion(verTxt);
  if (!t) throw new Error(`invalid version in range: ${raw}`);

  switch (op) {
    case "=":  return exactly(t);
    case ">=": return (v) => cmp(v, t) >= 0;
    case "<=": return (v) => cmp(v, t) <= 0;
    case ">":  return (v) => cmp(v, t) >  0;
    case "<":  return (v) => cmp(v, t) <  0;
    default:   throw new Error(`unsupported operator: ${op}`);
  }
}

function compileAnd(raw: string): Constraint {
  // whitespace-separated clauses are AND'd together.
  const clauses = raw.trim().split(/\s+/).filter(Boolean).map(compileClause);
  if (clauses.length === 0) return () => true;
  return (v) => clauses.every((c) => c(v));
}

function compileRange(raw: string): Constraint {
  // `||` separates OR groups.
  const groups = raw.split("||").map((g) => compileAnd(g));
  if (groups.length === 0) return () => true;
  return (v) => groups.some((g) => g(v));
}

/**
 * `version` が `range` を満たすか判定する.
 *
 * @returns `true` / `false` — 解析失敗は `false` (fail-closed).
 */
export function satisfiesSemverRange(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (!v) return false;
  try {
    return compileRange(range)(v);
  } catch {
    return false;
  }
}
