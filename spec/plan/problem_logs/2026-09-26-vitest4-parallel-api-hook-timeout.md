# Vitest 4 ignores singleFork: API suites time out importing the app

- Date: 2026-09-26
- Status: fixed in working tree
- Area: test runner configuration (`vitest.config.ts`)
- Severity: Revisor registered test (`npm test`) fails, PR review blocked

## Summary

Revisor local PR #2008 (`feat/local-mode-team-owner`) failed the registered `npm test` twice
(2026-09-26 05:32 and 05:5x, JST-less server time). 10–13 API suites under `tests/api/` failed in
`beforeAll` at `await import("../../src/app.js")` with `Error: Hook timed out in 15000ms.`

This is a regression of the test configuration, not of the PR's code: the same failure reproduces
on `main` (9989a42) in a clean clone.

## Evidence

- Revisor PR #2008 `ci[2]` (test): exit 1, 46.5 s, `Failed Suites 10`, every failure is
  `Hook timed out in 15000ms` at the `beforeAll` that imports `src/app.js`.
- Clean clone + `git submodule update --init` + `npm i --include=dev` (Revisor's registered install) + `npm test`:
  - branch head: `Test Files 13 failed | 38 passed (51)`
  - `main` 9989a42: `Test Files 14 failed | 35 passed (49)`
- vitest prints `DEPRECATED test.poolOptions was removed in Vitest 4. All previous poolOptions are now top-level options.`
- A single API suite alone imports `src/app.ts` in about 7.4 s (vitest import breakdown: `src/app.ts`
  6.98 s total; largest parts `drizzle-orm`, `@aws-sdk/client-ssm`, `src/db/connection.ts`).
  No I/O wait or network access was found in the import graph.

## Regression Context

`vitest.config.ts` was written for Vitest 3 with `poolOptions.forks.singleFork: true` (all test files
serially in one fork). After the upgrade to Vitest `^4.1.0` the option is dropped with only a
deprecation notice, so test files run in up to `cores - 1` (23 on the Revisor host) parallel forks.
`hookTimeout: 15000` (2026-08-24) already reflected slow app imports. Passing runs (#2005, a worktree
borrowing `main`'s `node_modules`) were timing luck.

## Cause

Each API suite cold-imports the whole app in `beforeAll`. Many forks doing it at once contend for CPU
and the transform server, pushing each import past the 15 s hook timeout. Adding more API suites
(this PR adds `tests/api/local-owner-teams.test.ts`) makes the failure more likely.

## Fix Requirements

- Express the serial run in Vitest 4 terms: `maxWorkers: 1` (per-file isolation stays on).
- Do not keep `test.poolOptions`.
- Keep `hookTimeout` / `testTimeout` unchanged so a real import hang still fails.

## Verification

- `tests/unit/vitest-config.test.ts` asserts `maxWorkers === 1` and no `poolOptions`.
- Clean clone + `npm ci` + `npm test` (pretest `sdk:build` included) must pass every suite.

## Follow-up

- The serial run takes about 3.5 minutes. If it needs to be faster, make the API suites share one
  app import or cut the app's import cost; do not re-enable file parallelism without that.
