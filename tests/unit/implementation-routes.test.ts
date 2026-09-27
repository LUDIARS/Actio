import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
const mocks = vi.hoisted(() => ({ change: vi.fn(), list: vi.fn(), manifest: vi.fn(), role: vi.fn(), apiClient: vi.fn() }));
vi.mock("../../src/config/secrets.js", () => ({ secretManager: { get: () => "https://pf.example.test" } }));
vi.mock("../../src/db/planning-repository.js", () => ({ planningRepositories: () => ({ implementation: mocks }) }));
vi.mock("../../src/db/repository.js", () => ({ teamMemberRepo: { findRole: mocks.role }, apiClientRepo: { findByClientId: mocks.apiClient, updateLastUsed: async () => {} } }));
vi.mock("../../src/auth/local-mode.js", () => ({ isLocalModeRequest: () => false }));
vi.mock("bcryptjs", () => ({ default: { compare: async (secret: string) => secret === "valid-secret" } }));
vi.mock("../../src/auth/local-owner.js", () => ({ isLocalOwnerRequest: () => false, resolveLocalOwnerTeamRole: vi.fn() }));
vi.mock("../../modules/task/planning/praeforma-client.js", () => ({ PraeformaClient: class { implementationManifest = mocks.manifest; } }));
import { implementationRoutes } from "../../modules/task/implementation/routes.js";

const url = "/team/planning/praeforma/projects/p/implementation";
function app(service = false) {
  const result = new Hono();
  result.use("*", async (c, next) => {
    c.set("userId" as never, "human" as never);
    if (service) c.set("apiClientId" as never, "service" as never);
    await next();
  });
  result.route("/", implementationRoutes); return result;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.role.mockResolvedValue("leader");
  mocks.manifest.mockResolvedValue({ teamId: "team", projectId: "p", subjects: [{ kind: "scenario", id: "s", revision: "v1", title: "庭", description: "朝" }] });
  mocks.list.mockResolvedValue([]); mocks.change.mockResolvedValue({ state: "completed" });
  mocks.apiClient.mockResolvedValue({ id: "service", userId: "service-owner", isActive: true, clientSecretHash: "test-hash", scopes: ["tasks"] });
});
it("allows team reads but rejects a foreign Pf project", async () => {
  mocks.role.mockResolvedValue("member");
  expect((await app().request(url)).status).toBe(200);
  mocks.manifest.mockResolvedValue({ teamId: "foreign", projectId: "p", subjects: [] });
  expect((await app().request(url)).status).toBe(403);
  expect(mocks.list).toHaveBeenCalledTimes(1);
});
it("only accepts confirmation from a human leader, never a service identity", async () => {
  const init = { method: "POST", headers: { "Content-Type": "application/json", "X-Decided-By": "human" },
    body: JSON.stringify({ action: "confirm", fingerprint: "snapshot", note: "画面を確認" }) };
  expect((await app(true).request(url + "/scenario/s", init)).status).toBe(403);
  expect(mocks.change).not.toHaveBeenCalled();
  mocks.role.mockResolvedValue("member");
  expect((await app().request(url + "/scenario/s", init)).status).toBe(403);
  mocks.role.mockResolvedValue("leader");
  expect((await app().request(url + "/scenario/s", init)).status).toBe(200);
  expect(mocks.change).toHaveBeenCalledWith("team", "p", expect.objectContaining({ revision: "v1" }), "human", expect.objectContaining({ action: "confirm" }), expect.any(Date));
});
it("does not change state when Pf is unreachable or the subject was deleted", async () => {
  mocks.manifest.mockRejectedValueOnce(new Error("offline"));
  expect((await app().request(url)).status).toBe(502);
  const response = await app().request(url + "/scenario/deleted", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", fingerprint: "snapshot", note: "確認" }) });
  expect(response.status).toBe(404); expect(mocks.change).not.toHaveBeenCalled();
});
it("authenticates the read-only service route and requires an actual team member", async () => {
  expect((await app().request(url + "/service")).status).toBe(401);
  const headers = { "X-API-Client-ID": "service", "X-API-Client-Secret": "valid-secret", "X-Decided-By": "human" };
  expect((await app().request(url + "/service", { headers: { ...headers, "X-API-Client-Secret": "invalid" } })).status).toBe(401);
  const response = await app().request(url + "/service", { headers });
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ canConfirm: false });
  mocks.role.mockResolvedValue(undefined);
  expect((await app().request(url + "/service", { headers })).status).toBe(403);
  expect(mocks.list).toHaveBeenCalledTimes(1);
});
