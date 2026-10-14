import { describe, expect, it, vi } from "vitest";
import { createCcPublicClient } from "../../modules/public-issues/cc-public-client.js";
import { parsePublicProjectCodes, parsePublicReports } from "../../modules/public-issues/cc-public-parse.js";
import { createTtlCache } from "../../modules/public-issues/ttl-cache.js";

/** Cc が誤って内部項目を混ぜて返しても、 公開項目だけが残ることを確かめる */
const rawReport = {
  id: "r-1",
  project: "At",
  public_title: "ログインで 500",
  public_summary: "特定の条件で 500 になる",
  severity: "s2",
  status: "deployed",
  public_name: "neco",
  reward_tokens: 1000,
  received_at: "2026-10-01T00:00:00Z",
  deployed_at: "2026-10-03T00:00:00Z",
  what_happened: "原文: 社内 URL https://internal.example で...",
  repro_steps: "原文の再現手順",
  channel: "discord",
  platform_user_id: "1234567890",
  platform_message_id: "998877",
  reason: "判定の内部理由",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("parsePublicReports", () => {
  it("keeps only the public fields of spec §8", () => {
    const [report] = parsePublicReports({ reports: [rawReport] }) ?? [];
    expect(report).toEqual({
      reportId: "r-1", title: "ログインで 500", summary: "特定の条件で 500 になる", severity: "s2", status: "deployed",
      publicName: "neco", rewardTokens: 1000, receivedAt: "2026-10-01T00:00:00.000Z", deployedAt: "2026-10-03T00:00:00.000Z",
    });
    const serialized = JSON.stringify(report);
    for (const leaked of ["原文", "discord", "1234567890", "998877", "判定の内部理由", "internal.example"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("drops rows without an id or a public title and rejects malformed payloads", () => {
    expect(parsePublicReports({ reports: [{ id: "r-2" }, { public_title: "x" }] })).toEqual([]);
    expect(parsePublicReports({ items: [] })).toBeNull();
    expect(parsePublicReports(null)).toBeNull();
  });

  it("ignores unknown severities and negative rewards", () => {
    const [report] = parsePublicReports({ reports: [{ ...rawReport, severity: "critical", reward_tokens: -5 }] }) ?? [];
    expect(report.severity).toBeNull();
    expect(report.rewardTokens).toBeNull();
  });
});

describe("parsePublicProjectCodes", () => {
  it("accepts code strings or { code } entries and drops malformed codes", () => {
    expect(parsePublicProjectCodes({ projects: ["At", { code: "Cc" }, "bad code", 3, "At"] })).toEqual(["At", "Cc"]);
  });

  it("returns null when the list is missing", () => {
    expect(parsePublicProjectCodes({})).toBeNull();
  });
});

describe("createTtlCache", () => {
  it("does not return a value after the ttl", () => {
    let now = 0;
    const cache = createTtlCache<string>(60_000, () => now);
    cache.set("k", "v");
    now = 59_999;
    expect(cache.get("k")).toBe("v");
    now = 60_000;
    expect(cache.get("k")).toBeUndefined();
  });
});

describe("createCcPublicClient", () => {
  it("caches a successful read for 60 seconds and reads Cc again afterwards", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ projects: ["At"] }));
    const client = createCcPublicClient({ baseUrl: () => "http://cc.test", fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });
    expect(await client.publicProjectCodes()).toEqual(["At"]);
    now = 30_000;
    await client.publicProjectCodes();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 60_000;
    await client.publicProjectCodes();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://cc.test/v1/projects/public-issues");
  });

  it("returns null when Cc is unreachable and does not keep serving stale data as success", async () => {
    let now = 0;
    let reachable = true;
    const fetchImpl = vi.fn(async () => {
      if (!reachable) throw new Error("ECONNREFUSED");
      return jsonResponse({ reports: [rawReport] });
    });
    const client = createCcPublicClient({ baseUrl: () => "http://cc.test", fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });
    expect(await client.publicReports("At")).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://cc.test/v1/bounty/public-reports?project=At");
    reachable = false;
    now = 61_000;
    expect(await client.publicReports("At")).toBeNull();
  });

  it("treats a non-2xx response and an unset CONCORDIA_URL as unavailable", async () => {
    const failing = createCcPublicClient({ baseUrl: () => "http://cc.test", fetchImpl: (async () => jsonResponse({}, 503)) as unknown as typeof fetch });
    expect(await failing.publicProjectCodes()).toBeNull();
    const fetchImpl = vi.fn();
    const unconfigured = createCcPublicClient({ baseUrl: () => "", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await unconfigured.publicProjectCodes()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
