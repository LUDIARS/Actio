// @spec スプリントフェーズの通知と受信
import { z } from "zod";
import type { Projection, Delivery, CcEvent, DecisionOutcome } from "./contracts.js";
const id = z.string().min(1).max(200);
const event = z.object({ eventId: id, dialogueKey: z.string().min(1), teamId: id, sprintId: id, revision: z.number().int().positive(), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/), action: z.enum(["approve", "reject", "hold", "resume", "resubmit"]), reason: z.string().trim().min(1).max(4000), taskIds: z.array(id).max(5000), actor: z.object({ discordUserId: z.string().regex(/^\d+$/), discordGuildId: z.string().regex(/^\d+$/) }), occurredAt: z.string().datetime() });
const dialogue = z.object({ dialogueKey: z.string(), revision: z.number().int(), deliveryStatus: z.enum(["pending", "delivered", "failed", "unknown"]), threadUrl: z.string().nullable(), lastError: z.string().nullable() });
export class SprintDialogueClient {
    private readonly url: string;
    constructor(base: string | undefined, private readonly signal: AbortSignal, private readonly request: typeof fetch = fetch) {
        if (!base)
            throw new Error("CONCORDIA_URL が未設定です。スプリント通知を配送できません");
        const parsed = new URL(base);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash)
            throw new Error("CONCORDIA_URL が不正です");
        this.url = base.replace(/\/$/, "");
    }
    private async call(path: string, method = "GET", body?: unknown): Promise<unknown> {
        const response = await this.request(this.url + path, { method, headers: { "content-type": "application/json; charset=utf-8" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.any([this.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok)
            throw new Error(`Cc sprint dialogue HTTP ${response.status}`);
        const text = await response.text();
        if (text.length > 2000000)
            throw new Error("Cc response exceeds limit");
        return JSON.parse(text) as unknown;
    }
    async publish(value: Projection): Promise<Delivery> {
        const result = z.object({ dialogue }).parse(await this.call("/v1/sprint-dialogues/" + encodeURIComponent(value.dialogueKey), "PUT", value)).dialogue;
        if (result.dialogueKey !== value.dialogueKey || result.revision !== value.revision)
            throw new Error("Cc projection revision does not match");
        return { status: result.deliveryStatus, threadUrl: result.threadUrl, lastError: result.lastError };
    }
    async events(): Promise<CcEvent[]> { return z.object({ events: z.array(event).max(100) }).parse(await this.call("/v1/sprint-dialogues/events?limit=100")).events; }
    async ack(eventId: string, outcome: DecisionOutcome): Promise<void> { await this.call("/v1/sprint-dialogues/events/" + encodeURIComponent(eventId) + "/ack", "POST", outcome); }
}
