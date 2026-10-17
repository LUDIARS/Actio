# SPEC-ACTIO-RESUME-001: authenticated browser resume recovery

User requests recovery across LUDIARS when retained browser pages outlive keepalive/WS sessions. Actio installs recovery in its authenticated Layout, not AuthProvider or the login page, and disposes listeners on unmount/logout (including StrictMode remount).

Reload on history-cache restoration, a hidden interval of at least 60 seconds, or a closed WS on short return. Wait for online/visible; coalesce duplicate events. Normal initial load and a brief healthy switch do not reload. Existing websocket reconnect and HTTP identity refresh remain authoritative after the new document loads.

Lifecycle and draft guard mirror reviewed Corpus 13dbf0015909, without adding an unrelated framework/submodule dependency. Input changes and pending submission controls prevent automatic reload; explicit update notice confirms draft loss. Saved form reset and removed controls clear tracked edits. No input/token is persisted by recovery.

The standalone declarative.html entry installs the same adapter only after successful identity and panel loading. It has no WS health predicate: history restoration and long absence drive reload. Its lifetime is the document, with explicit disposal during hot-module replacement.

Acceptance: lifecycle/draft tests, frontend lint/build, project CI checks, reviewed deployment.
