import { Hono } from "hono";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { initTestDatabase } from "../helpers.js";

const deployment = vi.hoisted(() => ({ enabled: true }));
vi.mock("../../src/auth/local-mode.js", async original => ({
  ...await original<typeof import("../../src/auth/local-mode.js")>(),
  localModeEnabled: () => deployment.enabled,
}));
let access: typeof import("../../modules/task/chat/access.js");
beforeAll(async () => { initTestDatabase(); access = await import("../../modules/task/chat/access.js"); });
async function check(userId: string, localAccess?: string, apiClientId?: string, teamRole = "leader") {
  const app = new Hono();
  app.get("/", c => {
    for (const [key, value] of Object.entries({ userId, localAccess, apiClientId, teamRole }))
      if (value) c.set(key as never, value as never);
    return c.json({ human: access.chatHuman(c), administrator: access.chatAdministrator(c) });
  });
  return (await app.request("/")).json();
}
describe("chat access in local and authenticated deployments", () => {
  it("accepts only verified local-owner paths", async () => {
    for (const path of ["loopback", "cf-access"]) expect(await check("actio-local", path)).toEqual({ human: true, administrator: true });
    expect(await check("actio-local")).toEqual({ human: false, administrator: false });
    deployment.enabled = false;
    try { expect(await check("actio-local", "loopback")).toEqual({ human: false, administrator: false }); }
    finally { deployment.enabled = true; }
  });
  it("rejects service identities and retains authenticated role separation", async () => {
    expect(await check("actio-local", "loopback", "service")).toEqual({ human: false, administrator: false });
    expect(await check("anonymous")).toEqual({ human: false, administrator: false });
    expect(await check("person")).toEqual({ human: true, administrator: false });
    expect(await check("person", undefined, undefined, "admin")).toEqual({ human: true, administrator: true });
  });
});
