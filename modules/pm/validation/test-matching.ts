/**
 * 変更ファイルと対応テストの照合 (純粋関数, PLAN §3.2, completion.md AT-PM-VALIDATION)
 *
 * テストファイル自体の変更はそのまま数える。それ以外のファイルは、同じ basename の
 * `*.test.*` / `*.spec.*` がリポジトリ内にあれば対応テストとする。
 */

export type TestCoverage = "found" | "missing" | "unknown";

const TEST_FILE = /\.(test|spec)\.[^./]+$/;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path) || /(^|\/)__tests__\//.test(path);
}

function stem(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(TEST_FILE, "").replace(/\.[^.]+$/, "");
}

export interface TestMatchResult {
  testFiles: string[];
  testCoverage: TestCoverage;
}

/**
 * @param affectedFiles 関連コミットで変更されたファイル
 * @param repositoryFiles リポジトリのファイル一覧。取得できなければ null
 */
export function matchTestFiles(affectedFiles: readonly string[], repositoryFiles: readonly string[] | null): TestMatchResult {
  const changedTests = affectedFiles.filter(isTestFile);
  const sources = affectedFiles.filter((path) => !isTestFile(path));
  const matched = new Set(changedTests);
  if (repositoryFiles) {
    const testsByStem = new Map<string, string[]>();
    for (const path of repositoryFiles.filter(isTestFile)) {
      const key = stem(path);
      testsByStem.set(key, [...(testsByStem.get(key) ?? []), path]);
    }
    for (const source of sources) {
      for (const test of testsByStem.get(stem(source)) ?? []) matched.add(test);
    }
  }
  const testFiles = [...matched].sort();
  if (affectedFiles.length === 0) return { testFiles, testCoverage: "unknown" };
  if (testFiles.length > 0) return { testFiles, testCoverage: "found" };
  // 一覧が取れずテストの変更も無いときは、無いとは言い切れない
  return { testFiles, testCoverage: repositoryFiles ? "missing" : "unknown" };
}
