/**
 * Cloudflare Access のアサーション (Cf-Access-Jwt-Assertion) を検証する。
 * spec/feature/local-mode-cf-access.md §3
 *
 * 署名は team domain の JWKS (RS256)。 iss / aud / 期限 / 許可 email を照合する。
 * 署名の無い Cf-Access-Authenticated-User-Email や、 Cloudflare 側で変わりうる sub は使わない。
 */

import { createPublicKey, type KeyObject } from "node:crypto";

/** JWKS の 1 エントリ。 @types/node の版によって crypto.JsonWebKey が無いので自前で持つ。 */
type Jwk = Record<string, unknown> & { kid?: unknown; kty?: unknown };
import jwt from "jsonwebtoken";
import type { CfAccessConfig } from "./local-mode-policy.js";

const CLOCK_TOLERANCE_SECONDS = 60;
/** 未知の kid が続いても証明書を取りに行き続けないための最小間隔。 */
const JWKS_REFETCH_MIN_MS = 30_000;
const JWKS_TIMEOUT_MS = 10_000;

export interface CfAccessIdentity {
  email: string;
}

export interface CfAccessVerifierDeps {
  fetchJwks: (url: string) => Promise<unknown>;
  now: () => number;
}

async function fetchJwksOverHttp(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(JWKS_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Cloudflare Access certs returned HTTP ${response.status}`);
  return response.json();
}

const defaultDeps: CfAccessVerifierDeps = { fetchJwks: fetchJwksOverHttp, now: () => Date.now() };

function readKeys(body: unknown): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const list = typeof body === "object" && body !== null ? (body as { keys?: unknown }).keys : undefined;
  if (!Array.isArray(list)) throw new Error("Cloudflare Access certs are malformed");
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const jwk = entry as Jwk;
    if (typeof jwk.kid !== "string" || jwk.kty !== "RSA") continue;
    keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" } as Parameters<typeof createPublicKey>[0]));
  }
  return keys;
}

export function createCfAccessVerifier(config: CfAccessConfig, deps: CfAccessVerifierDeps = defaultDeps) {
  const issuer = `https://${config.teamDomain}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  let keys = new Map<string, KeyObject>();
  let lastFetchAt: number | null = null;

  async function refreshKeys(): Promise<void> {
    const now = deps.now();
    if (lastFetchAt !== null && now - lastFetchAt < JWKS_REFETCH_MIN_MS) return;
    lastFetchAt = now;
    keys = readKeys(await deps.fetchJwks(certsUrl));
  }

  return {
    /** 通してよければ email を返す。 形・署名・クレームのどれかが合わなければ null。 */
    async verify(assertion: string): Promise<CfAccessIdentity | null> {
      const decoded = jwt.decode(assertion, { complete: true });
      if (!decoded || typeof decoded === "string") return null;
      const kid = decoded.header.kid;
      if (!kid) return null;
      if (!keys.has(kid)) {
        try { await refreshKeys(); }
        catch { return null; } // Certificates unavailable: fail closed rather than trusting the header.
      }
      const key = keys.get(kid);
      if (!key) return null;
      let payload: jwt.JwtPayload | string;
      try {
        payload = jwt.verify(assertion, key, {
          algorithms: ["RS256"],
          audience: config.audiences as [string, ...string[]],
          issuer,
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          clockTimestamp: Math.floor(deps.now() / 1000),
        });
      } catch {
        return null;
      }
      if (typeof payload === "string") return null;
      const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!email || !config.allowedEmails.includes(email)) return null;
      return { email };
    },
  };
}
