// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatError, type Connection } from "./contracts.js";

export class ConcordiaRequest {
  constructor(private readonly base: string, private readonly key: string, private readonly connection: Connection, private readonly signal: AbortSignal) {
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !key) throw new ChatError("Ccの接続設定が不正です", 503);
  }
  send(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${this.base.replace(/\/$/, "")}/v1/actio-chat/request`, { method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ teamId: this.connection.teamId, platform: this.connection.platform, workspaceId: this.connection.workspaceId, path, method, body }),
      signal: AbortSignal.any([this.signal, AbortSignal.timeout(35_000)]) });
  }
  /** DiscordRest's injected request never contacts Discord directly in Cc mode. */
  discordFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://discord.com" || !url.pathname.startsWith("/api/v10/")) throw new ChatError("不正なDiscord API要求", 400);
    return this.send(url.pathname.slice("/api/v10".length) + url.search, init?.method ?? "GET", typeof init?.body === "string" ? JSON.parse(init.body) : undefined);
  };
  async slack<T>(method: string, body: unknown): Promise<T> {
    const response = await this.send(method, "POST", body);
    if (!response.ok) throw new ChatError(`Cc/Slack HTTP ${response.status}`, response.status === 400 || response.status === 403 ? 400 : 503);
    const value = await response.json() as T & { ok?: boolean; error?: string };
    if (!value.ok) throw new ChatError(`Slack: ${value.error ?? "request_failed"}`, 503);
    return value;
  }
}
