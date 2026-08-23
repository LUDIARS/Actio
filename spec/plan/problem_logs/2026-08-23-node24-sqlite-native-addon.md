# Node 24 SQLite native addon compatibility

- Date: 2026-08-23
- Status: fixed in working tree
- Area: dependency/runtime compatibility
- Severity: service installation or startup failure

## Summary

The Node.js 24 rollout exposed cross-repository risk from SQLite native addons. Actio used the V8-ABI-bound `better-sqlite3` 12.x line instead of the organization N-API baseline.

## Evidence

`package.json` declared `better-sqlite3` as `^12.8.0`. Reusing a native binary produced for a different runtime can fail installation or startup even when application code is unchanged.

## Regression Context

The runtime major version was advanced without a single native-addon baseline and cache invalidation rule across repositories.

## Cause

SQLite dependency versions and native artifacts were managed independently by each repository.

## Fix Requirements

- Pin `better-sqlite3` to the N-API baseline `13.0.3`.
- Regenerate the lockfile without executing dependency lifecycle scripts.
- Reinstall dependencies under Node 24 before starting the service.

## Verification

No tests were run in this session by policy. The registered CI installs dependencies under Node 24.14.1 and runs the repository test suite; `tests/helpers.ts` opens, initializes, and closes a SQLite database, so that path exercises native-addon loading and basic database operation.

## Follow-up

Dependency caches must include the Node major version and lockfile hash so binaries are not reused across Node upgrades.
