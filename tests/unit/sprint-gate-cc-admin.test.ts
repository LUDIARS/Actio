import { describe, it, expect, vi } from "vitest";
import { runSprintGateCycle, type GateCycleDependencies } from "../../modules/task/sprint-gates/worker.js";
import { SprintDialogueClient } from "../../modules/task/sprint-gates/concordia-client.js";
import { parseCcAdmins, ccAdminActor } from "../../modules/task/sprint-gates/cc-admins.js";
import type { CcEvent, DecisionOutcome } from "../../modules/task/sprint-gates/contracts.js";

const ADMIN_ID = "905235114026467350";
const OTHER_ID = "123456789012345678";
function event(discordUserId: string): CcEvent {
    return { eventId: "admin-approve", dialogueKey: "actio:team:sprint", teamId: "team", sprintId: "sprint", revision: 3, sourceFingerprint: "a".repeat(64), action: "approve", reason: "いったんやってみるよ", taskIds: [], actor: { discordUserId, discordGuildId: "1136199339417534606" }, occurredAt: "2026-10-12T00:00:00Z" };
}
function fixture(discordUserId: string, resolveIdentity: GateCycleDependencies["resolveIdentity"]) {
    const outcomes = new Map<string, DecisionOutcome>();
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (input) => String(input).endsWith("/ack") ? Response.json({ ok: true }) : Response.json({ events: [event(discordUserId)] }));
    const store: GateCycleDependencies["store"] = {
        candidates: vi.fn(async () => []), pending: vi.fn(async () => []), view: vi.fn(), delivery: vi.fn(async () => { }),
        eventOutcome: vi.fn(async (id) => outcomes.get(id)),
        rejectExternal: vi.fn(async (_team, _sprint, id, reason) => { const value = { outcome: "rejected" as const, reason }; outcomes.set(id, value); return value; }),
        decide: vi.fn(async (_team, _sprint, _actor, input) => { const value = { outcome: "applied" as const, reason: "applied" }; outcomes.set(input.eventId, value); return value; }),
    };
    const deps: GateCycleDependencies = { store, concordia: () => new SprintDialogueClient("http://cc.example", controller.signal, fetcher), resolveIdentity, ccAdmins: parseCcAdmins(`neco:${ADMIN_ID}`), now: () => new Date("2026-10-12T00:00:00Z"), signal: controller.signal, warn: vi.fn() };
    return { deps, outcomes };
}

describe("parseCcAdmins", () => {
    it("maps Discord ids to aliases", () => {
        expect([...parseCcAdmins(` neco:${ADMIN_ID} , ops-1:${OTHER_ID}`)]).toEqual([[ADMIN_ID, "neco"], [OTHER_ID, "ops-1"]]);
        expect(parseCcAdmins(undefined).size).toBe(0);
        expect(parseCcAdmins("  ").size).toBe(0);
    });
    it("fails closed when any entry is malformed or duplicated", () => {
        expect(parseCcAdmins(`neco:${ADMIN_ID},broken`).size).toBe(0);
        expect(parseCcAdmins(`neco:${ADMIN_ID},x:12`).size).toBe(0);
        expect(parseCcAdmins(`ne co:${ADMIN_ID}`).size).toBe(0);
        expect(parseCcAdmins(`neco:${ADMIN_ID}:extra`).size).toBe(0);
        expect(parseCcAdmins(`neco:${ADMIN_ID},other:${ADMIN_ID}`).size).toBe(0);
    });
    it("records only the alias as the actor", () => {
        expect(ccAdminActor("neco")).toBe("cc-admin:neco");
    });
});

describe("Cc administrator decision when Cernere cannot resolve the Discord user", () => {
    it("applies a configured administrator's decision without the leader row check", async () => {
        const { deps } = fixture(ADMIN_ID, vi.fn(async () => { throw new Error("CERNERE_PROJECT_ID missing"); }));
        await runSprintGateCycle(deps);
        expect(deps.store.decide).toHaveBeenCalledWith("team", "sprint", "cc-admin:neco", expect.objectContaining({ eventId: "cc:admin-approve", action: "approve", expectedRevision: 3 }), expect.any(Date), false);
        expect(deps.store.rejectExternal).not.toHaveBeenCalled();
    });
    it("also applies when Cernere answers that the Discord user is not linked", async () => {
        const { deps } = fixture(ADMIN_ID, vi.fn(async () => null));
        await runSprintGateCycle(deps);
        expect(deps.store.decide).toHaveBeenCalledWith("team", "sprint", "cc-admin:neco", expect.anything(), expect.any(Date), false);
    });
    it("keeps the Cernere-linked leader path when identity resolves", async () => {
        const { deps } = fixture(ADMIN_ID, vi.fn(async () => "cernere-user"));
        await runSprintGateCycle(deps);
        expect(deps.store.decide).toHaveBeenCalledWith("team", "sprint", "cernere-user", expect.anything(), expect.any(Date), true);
    });
    it("rejects a non-administrator whose identity cannot be resolved", async () => {
        const { deps, outcomes } = fixture(OTHER_ID, vi.fn(async () => { throw new Error("unavailable"); }));
        await runSprintGateCycle(deps);
        expect(deps.store.decide).not.toHaveBeenCalled();
        expect(outcomes.get("cc:admin-approve")).toEqual({ outcome: "rejected", reason: expect.stringContaining("Cernere の本人照合を利用できません") });
    });
    it("never stores the Discord id as the actor", async () => {
        const { deps } = fixture(ADMIN_ID, vi.fn(async () => null));
        await runSprintGateCycle(deps);
        const actor = vi.mocked(deps.store.decide).mock.calls[0][2];
        expect(actor).not.toContain(ADMIN_ID);
    });
});
