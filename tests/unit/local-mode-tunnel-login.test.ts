import { describe, expect, it } from "vitest";
import { isTunnelRequest, readLocalMode, readTunnelAuth, type CfAccessConfig } from "../../src/auth/local-mode-policy.js";

const CF_ENV: Record<string, string> = {
  ACTIO_LOCAL_MODE: "1",
  ACTIO_CLOUDFLARE_ENABLED: "1",
  ACTIO_CF_ACCESS_TEAM_DOMAIN: "ludiars.cloudflareaccess.com",
  ACTIO_CF_PUBLIC_ORIGIN: "https://actio.example.com",
};

const config: CfAccessConfig = {
  teamDomain: "ludiars.cloudflareaccess.com", audiences: [],
  publicOrigin: "https://actio.example.com", publicHost: "actio.example.com", tunnelAuth: "cernere",
};

function tunnelRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://actio.example.com/api/tasks", {
    headers: { host: "actio.example.com", "cf-ray": "1", "x-forwarded-for": "203.0.113.1", ...headers },
  });
}

describe("ACTIO_TUNNEL_AUTH (tunnel-cernere-login.md §2)", () => {
  it("既定は cf-access、 cernere を選べ、 それ以外は起動エラー", () => {
    expect(readTunnelAuth(undefined)).toBe("cf-access");
    expect(readTunnelAuth(" ")).toBe("cf-access");
    expect(readTunnelAuth("cernere")).toBe("cernere");
    expect(() => readTunnelAuth("none")).toThrow();
  });

  it("Cloudflare 設定に載る", () => {
    const env: Record<string, string> = { ...CF_ENV, ACTIO_TUNNEL_AUTH: "cernere" };
    expect(readLocalMode((name) => env[name]).cfAccess?.tunnelAuth).toBe("cernere");
    expect(readLocalMode((name) => CF_ENV[name]).cfAccess?.tunnelAuth).toBe("cf-access");
  });
});

describe("isTunnelRequest (tunnel-cernere-login.md §3)", () => {
  it("cloudflared のソケットから公開 hostname へ来た same-origin の要求はアサーションが無くても形が合う", () => {
    expect(isTunnelRequest("127.0.0.1", tunnelRequest(), config)).toBe(true);
    expect(isTunnelRequest("127.0.0.1", tunnelRequest({ origin: "https://actio.example.com", "sec-fetch-site": "same-origin" }), config)).toBe(true);
  });

  it("別ソケット・別ホスト・他 origin・cross-site は形が合わない", () => {
    expect(isTunnelRequest("192.168.1.2", tunnelRequest(), config)).toBe(false);
    expect(isTunnelRequest("127.0.0.1", tunnelRequest({ host: "other.example.com" }), config)).toBe(false);
    expect(isTunnelRequest("127.0.0.1", tunnelRequest({ origin: "https://evil.example" }), config)).toBe(false);
    expect(isTunnelRequest("127.0.0.1", tunnelRequest({ "sec-fetch-site": "cross-site" }), config)).toBe(false);
  });
});
