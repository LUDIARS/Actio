# Local authentication mode

Actio may run without Cernere login only in an explicitly selected, loopback-only deployment without Cloudflare. The default remains the existing authenticated deployment. Local mode does not grant administrator privileges; the local owner's team permissions (leader-equivalent on Cc-synced teams) are defined in `local-mode-cf-access.md` §4.1.

## Configuration and boundary

- Set `ACTIO_LOCAL_MODE=1` in the backend and frontend launch environments; unset or `0` disables it. Other values fail configuration validation.
- The deployment mode is fixed at application construction after secret initialization. Changing it requires a restart so listener binding and authentication policy cannot diverge during secret refresh.
- Actio never runs its own tunnel: configured `TUNNEL_TOKEN` or `CLOUDFLARE_TUNNEL_TOKEN` is rejected. `ACTIO_CLOUDFLARE_ENABLED` unset/empty/`0` keeps the deployment loopback-only. `ACTIO_CLOUDFLARE_ENABLED=1` additionally admits requests authenticated by Cloudflare Access through the shared tunnel, and requires the Access settings in `local-mode-cf-access.md` (startup fails otherwise). Configured `ACTIO_PUBLIC_URL` and `FRONTEND_URL` must use loopback hosts.
- Backend and Vite bind to `127.0.0.1` in local mode. Vite preserves the original Host and forwards to the IPv4 loopback backend. Both processes must receive the same mode setting. Never expose this frontend through a LAN listener or a proxy that strips forwarding/Cloudflare headers.
- Before any HTTP route or WebSocket upgrade, require an actual loopback socket address, a loopback request URL and Host, and a loopback Origin when supplied. Missing socket metadata fails closed. Cloudflare headers, forwarding headers, cross-site fetches and no-CORS requests are rejected, even if the transport peer is loopback. Header values cannot establish locality. The only exception is the Cloudflare Access path (`local-mode-cf-access.md`): a loopback socket from cloudflared, the configured public Host/Origin, and a `Cf-Access-Jwt-Assertion` whose signature, issuer, audience, expiry and email are verified by Actio.
- Nonlocal requests receive 403 in local mode, including requests to legacy public routes. This is a deployment boundary, not a fallback to anonymous authentication. With local mode disabled, ordinary token authentication remains in effect. The old development-only `X-User-Id` / `X-User-Role` impersonation fallback is removed: development environment alone must not authorize bypass.

## Identity and client behavior

Local requests use the fixed `actio-local` identity with the ordinary `general` role. Only the user ID anchor is persisted; no password, bearer token, identity profile or elevated permission is created. Team permissions of the local owner are derived per request from the verified access path and are never stored. Existing Cernere users and their tasks are not reassigned. Local mode identifies a machine-local user, not individual OS accounts.

REST and WS use the same boundary. `/api/auth/me` returns `localMode: true` and the local user without fetching Cernere. `/api/auth/ws-token` returns an empty token for local mode; this is not a reusable credential. WS independently checks the socket and headers. The SPA resolves `/me` before routing even with no saved login and supports tokenless WS reconnection. DB setup remains required.

## Validation and rollout

Policy cases cover loopback IPv4/IPv6, missing/remote sockets, forged local headers, Cloudflare/forwarded headers, foreign/null Origin and conflicting deployment settings. Tests must not be executed without explicit user authorization. Runtime validation additionally needs REST identity, task creation, WS dispatch/reconnection, initial SPA navigation, and rejection through Cloudflare/LAN paths. Starts/restarts must use Excubitor and the main project folder with a Concordia testing claim.

This change does not enable live configuration, restart Actio, migrate task data, modify Cc credentials, or fix all authorization gaps of the existing nonlocal deployment. Cc v3 currently requires a bearer credential; using tokenless local mode from that client requires a separately scoped Cc adjustment.
