import { describe, expect, it } from "vitest";
import { allowsLocalRequest, cfAccessAssertion, isLoopbackAddress, readLocalMode, type CfAccessConfig } from "../../src/auth/local-mode-policy.js";

function request(headers: Record<string, string> = {}, url = "http://localhost/api/tasks"): Request {
  return new Request(url, { headers: { host: "localhost", ...headers } });
}

const CF_ENV: Record<string, string> = {
  ACTIO_LOCAL_MODE: "1",
  ACTIO_CLOUDFLARE_ENABLED: "1",
  ACTIO_CF_ACCESS_TEAM_DOMAIN: "ludiars.cloudflareaccess.com",
  ACTIO_CF_ACCESS_AUD: "abc123",
  ACTIO_CF_PUBLIC_ORIGIN: "https://actio.example.com",
};

describe("local mode deployment", () => {
  it("is explicitly enabled and rejects public/tunnel configuration", () => {
    expect(readLocalMode(() => undefined).enabled).toBe(false);
    expect(readLocalMode((key) => key === "ACTIO_LOCAL_MODE" ? "1" : undefined)).toEqual({ enabled: true, cfAccess: null });
    for (const [key, value] of [
      ["ACTIO_CLOUDFLARE_ENABLED", "1"], ["TUNNEL_TOKEN", "configured"],
      ["CLOUDFLARE_TUNNEL_TOKEN", "configured"], ["ACTIO_PUBLIC_URL", "https://example.com"],
      ["FRONTEND_URL", "http://192.168.1.2"],
    ]) {
      const env: Record<string, string> = { ACTIO_LOCAL_MODE: "1", [key]: value };
      expect(() => readLocalMode((name) => env[name])).toThrow();
    }
    expect(() => readLocalMode(() => "true")).toThrow();
  });

  it("admits Cloudflare only with complete Access settings", () => {
    expect(readLocalMode((name) => CF_ENV[name]).cfAccess).toEqual({
      teamDomain: "ludiars.cloudflareaccess.com",
      audiences: ["abc123"],
      publicOrigin: "https://actio.example.com",
      publicHost: "actio.example.com",
    });
    // Who may pass is the Access policy's job: AUD is optional and there is no email allowlist.
    const withoutAud: Record<string, string> = { ...CF_ENV, ACTIO_CF_ACCESS_AUD: "" };
    expect(readLocalMode((name) => withoutAud[name]).cfAccess?.audiences).toEqual([]);
    for (const [key, value] of [
      ["ACTIO_CF_ACCESS_TEAM_DOMAIN", "evil.example.com"],
      ["ACTIO_CF_ACCESS_TEAM_DOMAIN", ""],
      ["ACTIO_CF_ACCESS_AUD", "not a tag"],
      ["ACTIO_CF_PUBLIC_ORIGIN", "http://actio.example.com"],
      ["ACTIO_CF_PUBLIC_ORIGIN", "https://actio.example.com/app"],
      ["ACTIO_CF_PUBLIC_ORIGIN", "https://127.0.0.1"],
      ["ACTIO_CLOUDFLARE_ENABLED", "yes"],
      ["TUNNEL_TOKEN", "configured"],
    ]) {
      const env: Record<string, string> = { ...CF_ENV, [key]: value };
      expect(() => readLocalMode((name) => env[name])).toThrow();
    }
  });
});

describe("local request boundary", () => {
  it.each(["127.0.0.1", "127.2.3.4", "::1", "::ffff:127.0.0.1"])("accepts direct socket %s", (peer) => {
    expect(isLoopbackAddress(peer)).toBe(true);
    expect(allowsLocalRequest(peer, request())).toBe(true);
  });
  it.each([undefined, "localhost", "192.168.1.2", "::ffff:192.168.1.2", "127.evil"])("rejects socket %s even with local headers", (peer) => {
    expect(allowsLocalRequest(peer, request({ origin: "http://localhost" }))).toBe(false);
  });
  it.each(["cf-connecting-ip", "cf-ray", "cf-access-jwt-assertion", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip", "via"])("rejects proxy marker %s even when empty", (header) => {
    expect(allowsLocalRequest("127.0.0.1", request({ [header]: "" }))).toBe(false);
  });
  const rejectedHeaders: Record<string, string>[] = [
    { host: "public.example" }, { host: "localhost.evil" }, { host: "localhost/path" },
    { origin: "https://evil.example" }, { origin: "null" },
    { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
    { "sec-fetch-mode": "no-cors" },
  ];
  it.each(rejectedHeaders)("rejects nonlocal browser authority %j", (headers) => {
    expect(allowsLocalRequest("127.0.0.1", request(headers))).toBe(false);
  });
  it.each(["same-origin", "none"])("accepts same-origin navigation marker %s", (site) => {
    expect(allowsLocalRequest("127.0.0.1", request({ "sec-fetch-site": site }))).toBe(true);
  });
  it("rejects a whitespace-padded local mode flag", () => {
    expect(() => readLocalMode((key) => key === "ACTIO_LOCAL_MODE" ? " yes " : undefined)).toThrow();
  });
  it("treats a whitespace-padded Cloudflare flag as configured", () => {
    const env: Record<string, string> = { ACTIO_LOCAL_MODE: " 1 ", ACTIO_CLOUDFLARE_ENABLED: " 1 " };
    expect(() => readLocalMode((name) => env[name])).toThrow();
  });
  it("rejects a public request URL despite a local Host", () => {
    expect(allowsLocalRequest("127.0.0.1", request({}, "https://public.example/api/tasks"))).toBe(false);
  });
});

describe("Cloudflare Access request shape", () => {
  const config: CfAccessConfig = {
    teamDomain: "ludiars.cloudflareaccess.com", audiences: ["abc123"],
    publicOrigin: "https://actio.example.com", publicHost: "actio.example.com",
  };
  function tunnelRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://actio.example.com/api/tasks", {
      headers: { host: "actio.example.com", "cf-access-jwt-assertion": "token", "cf-ray": "1", "x-forwarded-for": "203.0.113.1", ...headers },
    });
  }

  it("returns the assertion for the public host through the local cloudflared socket", () => {
    expect(cfAccessAssertion("127.0.0.1", tunnelRequest({ origin: "https://actio.example.com" }), config)).toBe("token");
  });

  it("rejects remote sockets, other hosts, foreign origins, cross-site fetches and missing assertions", () => {
    expect(cfAccessAssertion("192.168.1.2", tunnelRequest(), config)).toBeNull();
    expect(cfAccessAssertion("127.0.0.1", tunnelRequest({ host: "other.example.com" }), config)).toBeNull();
    expect(cfAccessAssertion("127.0.0.1", tunnelRequest({ origin: "https://evil.example" }), config)).toBeNull();
    expect(cfAccessAssertion("127.0.0.1", tunnelRequest({ "sec-fetch-site": "cross-site" }), config)).toBeNull();
    expect(cfAccessAssertion("127.0.0.1", tunnelRequest({ "cf-access-jwt-assertion": "" }), config)).toBeNull();
  });
});
