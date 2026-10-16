---
title: LUDIARS 9-tool design review — Actio
type: plan
status: proposed
service: actio
domain: web-frontend
updated: 2026-10-17
tags: [design-review, cross-service]
---

# Actio: task authority and explicit integration evidence

## Shared model and scope

Actio owns task content, status, dependencies and sprint decisions. Cc owns
session/run coordination; Rv owns review and merge evidence; Pf owns versioned
specification; An owns implementation analysis; Augur owns test evidence;
Br derives summaries; Cf owns play/adoption feedback; Genius owns judgment cards.
Optimisation must preserve these owners, not combine unrelated state machines.

Reviewed main: `28d0067`. Sources: modules/task/team/cc-sync.ts,
modules/task/chat/runtime.ts, spec/feature/sprint-human-gates.md,
spec/feature/task-pr-evidence.md, spec/domains/web-frontend.domain.json,
frontend/src/pages/Dashboard.tsx, .claude/settings.json, package.json,
excubitor.catalog.yaml and CLAUDE.md.

## Findings and counterarguments

| Finding | Evidence and qualification | Decision |
|---|---|---|
| Duplicate specRefs keys silently discard UX and PR-evidence references. | web-frontend.domain.json has two keys; JSON parsing keeps only the later sprint reference. | Merge all three references under one key. This changes metadata, not application behaviour. |
| Project/task/run/PR terms overlap across services. | Sprint approval and PR-evidence specs explicitly distinguish Cc run completion from implementation/acceptance. | Keep Actio state authoritative and attach scoped references; no task-body copy into Br or Cc. |
| Cc integration uses polling. | cc-sync.ts and chat/runtime.ts are independently scheduled consumers with different lifetimes. Polling alone does not prove redundant state ownership. | First measure call count, oldest pending age and tick duration. Propose an outbox/cursor contract only after delivery/replay semantics are agreed. |
| One chat tick serialises expensive external work. | chat/runtime.ts owns a lease and per-connection processing. Removing serialisation can change exclusivity. | Separate bounded external execution from transactional claim/state changes; require lease-loss, duplicate delivery and slow-connection tests before implementation. |
| Push hook references another repository. | .claude/settings.json references Schedula's CI script, while CLAUDE.md describes Actio's scripts/ci-check.sh. | Confirm active hook ownership and current local-PR policy before changing a guard. No push or guard bypass was attempted. |
| Dashboard has a localhost authentication default. | Dashboard.tsx uses VITE_CERNERE_URL then localhost:8080. | Correctness depends on topology; mandatory env or URL changes are behaviour changes and are deferred. |

## Implemented unit

The duplicate metadata key is removed and UX, PR evidence and sprint approval
references all survive JSON parsing. Value: UX-AT-TASK-PROGRESS-01. Supporting
boundary: web-frontend metadata; state owners and runtime authentication remain
the same. Existing sprint-human-gates invariants remain referenced.

Validation: domain JSON syntax, one specRefs key, all three referenced files and
unchanged membership were checked statically. No runtime code changed, so no
new implementation-mirroring unit test was added. Session tests/build/startup
were not executed; local-PR review remains the verification gate.

Recovery: revert the metadata change; no data migration or restart is needed.
No human visual acceptance is claimed. Local main's other changes were untouched.

## Ordered proposals

1. **Identity before efficiency (Actio/Cc):** expose one canonical project/repo
   mapping and preserve scoped task/run references. Accept only an exact repo
   match; verify response loss and stale binding without creating duplicate work.
2. **Bounded work (Actio/Cc/Di):** instrument queue/tick latency, then isolate slow
   external work with bounded concurrency and lease-safe result commits. Keep a
   serial mode for rollback; do not merely shorten timeouts or polling intervals.
3. **Br summaries:** keep the aggregate API free of task body/title/assignee data;
   carry observation date and sprint revision so Br need not reconstruct authority.
4. **Setup consistency:** align stale onboarding documents with the current
   Vault/config/bootstrap flow, without deleting supported standalone modes.

Remaining: performance measurements and the multi-service delivery contract.
These are proposals, not measured speedups or completed runtime migrations.
