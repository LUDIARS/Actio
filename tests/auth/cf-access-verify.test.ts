import { generateKeyPairSync, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { createCfAccessVerifier } from "../../src/auth/cf-access-verify.js";
import type { CfAccessConfig } from "../../src/auth/local-mode-policy.js";

const config: CfAccessConfig = {
  teamDomain: "ludiars.cloudflareaccess.com",
  audiences: ["abc123"],
  allowedEmails: ["owner@example.com"],
  publicOrigin: "https://actio.example.com",
  publicHost: "actio.example.com",
};
const ISSUER = "https://ludiars.cloudflareaccess.com";

function keyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

const signing = keyPair();
const jwks = { keys: [{ ...signing.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" }] };

function sign(claims: Record<string, unknown> = {}, options: jwt.SignOptions = {}, key: KeyObject = signing.privateKey): string {
  return jwt.sign({ email: "Owner@Example.com", ...claims }, key, {
    algorithm: "RS256", keyid: "k1", audience: "abc123", issuer: ISSUER, expiresIn: 300, ...options,
  });
}

function verifier(fetchJwks: (url: string) => Promise<unknown> = async () => jwks, now: () => number = () => Date.now()) {
  return createCfAccessVerifier(config, { fetchJwks, now });
}

describe("createCfAccessVerifier", () => {
  it("accepts a signed assertion for an allowed email and fetches the team certs", async () => {
    const urls: string[] = [];
    const v = verifier(async (url) => { urls.push(url); return jwks; });
    expect(await v.verify(sign())).toEqual({ email: "owner@example.com" });
    expect(urls).toEqual(["https://ludiars.cloudflareaccess.com/cdn-cgi/access/certs"]);
    expect(await v.verify(sign())).toEqual({ email: "owner@example.com" });
    expect(urls).toHaveLength(1);
  });

  it("rejects wrong audience, issuer, expiry, email and signing key", async () => {
    const v = verifier();
    expect(await v.verify(sign({}, { audience: "other" }))).toBeNull();
    expect(await v.verify(sign({}, { issuer: "https://evil.cloudflareaccess.com" }))).toBeNull();
    expect(await v.verify(sign({}, { expiresIn: -600 }))).toBeNull();
    expect(await v.verify(sign({ email: "stranger@example.com" }))).toBeNull();
    expect(await v.verify(sign({}, {}, keyPair().privateKey))).toBeNull();
    expect(await v.verify("not-a-jwt")).toBeNull();
  });

  it("fails closed when certificates cannot be fetched and throttles refetching unknown kids", async () => {
    let calls = 0;
    const failing = verifier(async () => { calls += 1; throw new Error("down"); });
    expect(await failing.verify(sign())).toBeNull();
    expect(await failing.verify(sign())).toBeNull();
    expect(calls).toBe(1);

    let now = 1_000_000;
    let fetches = 0;
    const throttled = verifier(async () => { fetches += 1; return jwks; }, () => now);
    const unknownKid = sign({}, { keyid: "k2", expiresIn: 300, notBefore: 0 });
    await throttled.verify(unknownKid);
    await throttled.verify(unknownKid);
    expect(fetches).toBe(1);
    now += 31_000;
    await throttled.verify(unknownKid);
    expect(fetches).toBe(2);
  });
});
