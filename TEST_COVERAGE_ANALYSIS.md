# Test Coverage Analysis

## Current State

**84 test cases** across **11 API test files** in `tests/api/`. All backend-only, all integration-level (HTTP request/response). **Zero frontend tests.** **Zero unit tests for business logic.**

### Existing Test Files

| Test File | Cases | Coverage Level |
|-----------|-------|----------------|
| auth.test.ts | 13 | Good - register, login, logout, refresh, roles |
| reservation.test.ts | 11 | Good - CRUD, conflicts, validation |
| voting.test.ts | 11 | Good - events, votes, permissions |
| notification.test.ts | 9 | Good - preferences, webhooks, delivery logs |
| calendar.test.ts | 8 | Basic - personal events, plans, conflicts |
| m1-school.test.ts | 7 | Basic - departments, instructors, curricula |
| settings.test.ts | 7 | Basic - admin access, persistence |
| smart-scheduler.test.ts | 6 | Basic - task CRUD, solver, availability |
| groups.test.ts | 5 | Basic - create, join, leave, schedules |
| myplan.test.ts | 4 | Minimal - CRUD only |
| health.test.ts | 3 | Basic - info, health, timetable |

### What's Completely Untested

These modules have **zero tests** (~130 route handlers):

| Module | Endpoints | Risk |
|--------|-----------|------|
| **PM (M2)** - `modules/pm/` | ~25 handlers | HIGH - complex sync, analytics, conflict resolution |
| **MACHINA (M3)** - `modules/machina/` | ~17 handlers | HIGH - webhook processing, task auto-generation |
| **External API** - `modules/external-api/` | ~28 handlers | HIGH - API key auth, external-facing surface |
| **Holiday** - `modules/holiday/` | ~6 handlers | MEDIUM - holiday calculation, DB sync |
| **Reminder** - `modules/reminder/` | ~9 handlers | MEDIUM - text parsing, Alexa integration |
| **Profile** - `modules/profile/` | ~6 handlers | LOW - basic CRUD |
| **Facility Booking** - `modules/school/facility-booking/` | ~10 handlers | MEDIUM - booking logic, calendar sync |
| **Secrets/Setup** - `modules/secrets/`, `modules/setup/` | ~14 handlers | MEDIUM - admin setup flows |

---

## Priority Recommendations

### P0: Unit Tests for Complex Business Logic

These files contain algorithms and non-trivial logic that are currently untested. Bugs here would be hard to diagnose through integration tests alone.

#### 1. `modules/pm/analytics/critical-path.ts` - Critical Path Analysis
- **Why:** Implements topological sort + longest-path algorithm on a DAG of tasks
- **Tests needed:** Empty graph, single task, linear chain, diamond dependency, cycle detection, disconnected components
- **Estimated tests: 10-12**

#### 2. `modules/pm/sync/conflict-resolver.ts` - 3-Stage Merge Conflict Resolution
- **Why:** Merges local and remote task changes with field-level diffing
- **Tests needed:** No conflict, single-field conflict, multi-field conflict, local-wins vs remote-wins vs manual, timestamp-based resolution
- **Estimated tests: 10-15**

#### 3. `modules/pm/sync/diff-detector.ts` - Task Change Detection
- **Why:** Hashes and compares task snapshots to detect changes
- **Tests needed:** No changes, added/removed/modified fields, nested object changes, null/undefined handling
- **Estimated tests: 8-10**

#### 4. `modules/pm/validation/task-validator.ts` - Task Quality Scoring
- **Why:** 100-point scoring system for task completeness with weighted criteria
- **Tests needed:** Perfect score, zero score, partial scores, boundary values for each criterion
- **Estimated tests: 8-10**

#### 5. `modules/reminder/text-parser.ts` - Japanese Natural Language Date/Time Parsing
- **Why:** Regex-based parser for Japanese date expressions ("明日の15時", "来週月曜日")
- **Tests needed:** Each date pattern, ambiguous inputs, invalid inputs, confidence scoring, timezone edge cases
- **Estimated tests: 15-20**

#### 6. `modules/pm/analytics/gompertz.ts` - Gompertz Curve Bug Convergence
- **Why:** Mathematical model fitting for bug/defect prediction
- **Tests needed:** Known data points, convergence behavior, edge cases (no data, single point), prediction accuracy
- **Estimated tests: 6-8**

### P1: API Tests for Untested Modules

#### 7. PM Module API Tests (`modules/pm/`)
- **Why:** 25 endpoints, complex sync workflows, external service integration (GitHub, Notion)
- **Cover:** Project CRUD, task sync (pull/push), conflict listing/resolution, validation triggers, analytics endpoints
- **Estimated tests: 20-25**

#### 8. MACHINA Module API Tests (`modules/machina/`)
- **Why:** Webhook ingestion from Slack/Discord, auto-task generation, PM relay
- **Cover:** Channel monitor CRUD, webhook message processing, task auto-creation, status keyword detection
- **Estimated tests: 15-18**

#### 9. External API Tests (`modules/external-api/`)
- **Why:** External-facing API surface with API key authentication - security-sensitive
- **Cover:** API key generation/rotation, key-scoped access control, rate limiting, all CRUD through external API
- **Estimated tests: 15-20**

#### 10. Holiday Module API Tests (`modules/holiday/`)
- **Why:** Japanese holiday calculation (rule-based), DB sync, group-specific holidays
- **Cover:** Holiday calculation accuracy for known years, sync idempotency, group holiday CRUD, date-check utility
- **Estimated tests: 8-10**

### P2: Error Handling & Edge Cases in Existing Tests

Current tests focus on happy paths. Add negative/edge cases:

#### 11. Auth - Token Expiration & Security
- Expired token rejection, concurrent session limits, password change invalidates tokens
- **Estimated tests: 5-7**

#### 12. Groups - Authorization & Membership
- Non-member access rejection, role-based permission checks (admin vs member), group module enable/disable
- **Estimated tests: 6-8**

#### 13. Calendar - Conflict Detection & Recurring Events
- Overlapping event creation, recurring event edge cases (DST transitions, month boundaries), bulk operations
- **Estimated tests: 8-10**

#### 14. Smart Scheduler - Algorithm Correctness
- Constraint satisfaction validation, resource conflict detection, priority ordering, large task set performance
- **Estimated tests: 8-10**

### P3: Frontend Testing (Currently Zero Coverage)

#### 15. Frontend Unit Tests Setup
- **Action:** Add Vitest + React Testing Library to `frontend/`
- **Priority targets:**
  - `frontend/src/lib/api.ts` (1,682 lines) - Mock fetch, test token refresh, error handling
  - `frontend/src/lib/domain-format.ts` (236 lines) - Pure functions, easy to test
  - `frontend/src/lib/ui-format.ts` (229 lines) - Pure formatting functions
  - `frontend/src/lib/schema-format.ts` (149 lines) - Pure functions
- **Estimated tests: 30-40**

#### 16. Frontend Component Tests
- **Priority targets** (largest/most complex pages):
  - `DataManagementPage.tsx` (1,529 lines) - Test data import/export flows
  - `SchemaManagementPage.tsx` (1,419 lines) - Test schema editing
  - `GroupsPage.tsx` (841 lines) - Test group management interactions
  - `AuthContext.tsx` (105 lines) - Test auth state management
- **Estimated tests: 20-30**

---

## Summary

| Priority | Category | New Tests | Impact |
|----------|----------|-----------|--------|
| **P0** | Business logic unit tests | ~60 | Catches algorithm bugs, enables safe refactoring |
| **P1** | API tests for untested modules | ~65 | Covers 130 untested endpoints |
| **P2** | Edge cases in existing tests | ~30 | Hardens happy-path-only coverage |
| **P3** | Frontend tests | ~60 | Currently at 0% coverage |
| **Total** | | **~215** | |

### Quick Wins (Highest ROI, Easiest to Implement)

1. **`domain-format.ts` / `ui-format.ts` / `schema-format.ts`** - Pure functions, no mocking needed
2. **Holiday calculation** - Deterministic output, easily verifiable against known calendar data
3. **Task validator scoring** - Pure function with clear input/output contract
4. **Diff detector** - Pure function, straightforward test cases
5. **Health/holiday API tests** - Simple endpoints, minimal setup required
