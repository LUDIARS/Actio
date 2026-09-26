import { describe, it, expect, vi } from "vitest";
import { runSprintGateCycle, type GateCycleDependencies } from "../../modules/task/sprint-gates/worker.js";
import { SprintDialogueClient } from "../../modules/task/sprint-gates/concordia-client.js";
import type { CcEvent, DecisionOutcome, Projection } from "../../modules/task/sprint-gates/contracts.js";
const event: CcEvent = { eventId: "human-message", dialogueKey: "actio:team:sprint", teamId: "team", sprintId: "sprint", revision: 3, sourceFingerprint: "a".repeat(64), action: "approve", reason: "Confirmed", taskIds: [], actor: { discordUserId: "123", discordGuildId: "456" }, occurredAt: "2026-09-27T00:00:00Z" };
function fixture() {
    const outcomes = new Map<string, DecisionOutcome>();
    const ack = vi.fn();
    let failAck = true;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).endsWith("/ack")) {
            ack(JSON.parse(String(init?.body)));
            if (failAck) {
                failAck = false;
                throw new Error("Lost ACK response");
            }
            return Response.json({ ok: true });
        }
        return Response.json({ events: [event] });
    });
    const controller = new AbortController();
    const store: GateCycleDependencies["store"] = {
        candidates: vi.fn(async () => []), pending: vi.fn(async () => []), view: vi.fn(), delivery: vi.fn(async () => { }),
        eventOutcome: vi.fn(async (id) => outcomes.get(id)),
        rejectExternal: vi.fn(async (_team, _sprint, id, reason) => { const value = { outcome: "rejected" as const, reason }; outcomes.set(id, value); return value; }),
        decide: vi.fn(async (_team, _sprint, _actor, input) => { const value = { outcome: "applied" as const, reason: "applied" }; outcomes.set(input.eventId, value); return value; }),
    };
    const deps: GateCycleDependencies = { store, concordia: () => new SprintDialogueClient("http://cc.example", controller.signal, fetcher), resolveIdentity: vi.fn(async () => "cernere-user"), now: () => new Date(event.occurredAt), signal: controller.signal, warn: vi.fn() };
    return { deps, ack, outcomes };
}
describe("Cc event durable recovery", () => {
    it("does not reapply a decision after an acknowledgement response is lost", async () => {
        const { deps, ack } = fixture();
        await expect(runSprintGateCycle(deps)).rejects.toThrow("Lost ACK");
        await runSprintGateCycle(deps);
        expect(deps.store.decide).toHaveBeenCalledTimes(1);
        expect(deps.resolveIdentity).toHaveBeenCalledTimes(1);
        expect(ack).toHaveBeenCalledTimes(2);
        expect(deps.store.decide).toHaveBeenCalledWith("team", "sprint", "cernere-user", expect.objectContaining({ eventId: "cc:human-message", expectedRevision: 3 }), expect.any(Date), true);
    });
    it("makes unavailable identity visible and never treats a Discord id as an Actio actor", async () => {
        const { deps, outcomes } = fixture();
        deps.resolveIdentity = vi.fn(async () => { throw new Error("claim not declared"); });
        await expect(runSprintGateCycle(deps)).rejects.toThrow("Lost ACK");
        await runSprintGateCycle(deps);
        expect(deps.store.decide).not.toHaveBeenCalled();
        expect(outcomes.get("cc:human-message")).toEqual({ outcome: "rejected", reason: expect.stringContaining("Actio にログイン") });
    });
    it("keeps unknown delivery durable after a send response is lost", async () => {
        const { deps } = fixture();
        const payload: Projection = { version: 1, dialogueKey: event.dialogueKey, teamId: "team", sprintId: "sprint", sprintName: "Sprint", phase: "acceptance", revision: 3, sourceFingerprint: event.sourceFingerprint, held: false, closed: false, reason: "Done", summary: "Evidence", taskIds: ["task"], actioPath: "/tasks/planning?teamId=team&sprintId=sprint" };
        deps.store.pending = vi.fn(async () => [{ teamId: "team", sprintId: "sprint", revision: 3, payloadJson: JSON.stringify(payload), status: "pending" as const, threadUrl: null, lastError: null }]);
        deps.concordia = () => new SprintDialogueClient("http://cc.example", deps.signal, vi.fn<typeof fetch>(async (_input, init) => {
            if (init?.method === "PUT")
                throw new Error("send outcome unknown");
            return Response.json({ events: [] });
        }));
        await runSprintGateCycle(deps);
        expect(deps.store.delivery).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }), { status: "unknown", threadUrl: null, lastError: "send outcome unknown" });
    });
});
