import { describe, expect, it } from "vitest";
import { allowsLocalRequest, isLoopbackAddress, readLocalMode } from "../../src/auth/local-mode-policy.js";

function request(headers: Record<string, string> = {}, url = "http://localhost/api/tasks"): Request {
  return new Request(url, { headers: { host: "localhost", ...headers } });
}

describe("local mode deployment", () => {
  it("is explicitly enabled and rejects public/tunnel configuration", () => {
    expect(readLocalMode(() => undefined).enabled).toBe(false);
    expect(readLocalMode((key) => key === "ACTIO_LOCAL_MODE" ? "1" : undefined).enabled).toBe(true);
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
