---
title: Task PR evidence display
type: feature
id: AT-TASK-PR-01
---

Actio owns task content/status/dependencies. Cc writes optional
`pluginPayload.pull_requests` with provider, repository, id, number, URL, head_sha,
reviewed_head_sha, state, review, reflection and observed_at. The frontend presents
only valid records. Legacy/human tasks need no PR metadata. Other plugin payloads
are untouched. Unknown and stale evidence is displayed honestly; Test OK is not
merge, and merge is not verified reflection. Links accept HTTP(S) only.

UX-AT-TASK-PROGRESS-01. UI boundary: pure payload presentation model and a small
React component in the task list. Test malformed payloads, unsafe links, stale
approval and multi-provider identity. Existing critical-path and task status UI
remains authoritative. Rollback leaves optional payload values stored intact.
