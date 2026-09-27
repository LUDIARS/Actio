// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatError, type IntakeReview, reviewResult } from "./contracts.js";
import type { IntakeReviewer } from "./reviewer.js";

/** Cc owns provider credentials and remote I/O. No direct-provider fallback on Cc failure. */
export class ConcordiaChatTransport implements IntakeReviewer {
  constructor(private readonly base: string, private readonly key: string, private readonly signal: AbortSignal, private readonly request: typeof fetch = fetch) {
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !key)
      throw new ChatError("Ccチャット連携のURL・認証キーを確認してください", 503);
  }
  private async call<T>(action: string, value: unknown): Promise<T> {
    const result = await this.request(`${this.base.replace(/\/$/, "")}/v1/actio-chat/${action}`, { method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(value), signal: AbortSignal.any([this.signal, AbortSignal.timeout(70000)]),
    });
    if (!result.ok) throw new ChatError(`Ccチャット連携 HTTP ${result.status}`, result.status === 400 || result.status === 403 ? 400 : 503);
    return await result.json() as T;
  }
  async review(content: string, existingTitles: string[]): Promise<IntakeReview> {
    const result = reviewResult.parse(await this.call("review", { content, existingTitles }));
    if (!result.purpose) result.questions.push("目的・解決したい問題を教えてください。");
    if (!result.change) result.questions.push("対象と変更したい内容を教えてください。");
    if (!result.acceptance.length) result.questions.push("完了と判断する条件を教えてください。");
    return result;
  }
}
