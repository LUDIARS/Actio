/**
 * Stage 2 マージの LLM 呼び出し (PLAN §1.7)
 *
 * 提供元は内容審査 (modules/task/chat/reviewer.ts) と同じ OpenAI 互換の設定を使う。
 * 未設定は「マージできない」状態であり、成功扱いにしない (呼び出し側が人間の解決待ちに残す)。
 */

import { z } from "zod";
import { mergeInstructions } from "../domain/merge-prompt.js";

export class MergeProviderUnavailableError extends Error {}

export interface MergeModel {
  complete(request: string, signal: AbortSignal): Promise<string>;
}

const MERGE_TIMEOUT_MS = 60_000;

export class ConfiguredMergeModel implements MergeModel {
  constructor(
    private readonly settings: (key: string) => string | undefined,
    private readonly request: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.settings("ACTIO_INTAKE_LLM_URL") && this.settings("ACTIO_INTAKE_LLM_MODEL") && this.settings("ACTIO_INTAKE_LLM_KEY"));
  }

  async complete(request: string, signal: AbortSignal): Promise<string> {
    const base = this.settings("ACTIO_INTAKE_LLM_URL");
    const model = this.settings("ACTIO_INTAKE_LLM_MODEL");
    const key = this.settings("ACTIO_INTAKE_LLM_KEY");
    if (!base || !model || !key) throw new MergeProviderUnavailableError("LLM マージの提供元が未設定です");
    const url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new MergeProviderUnavailableError("LLM マージの接続設定が不正です");
    }
    const response = await this.request(base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      redirect: "error",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: mergeInstructions },
          { role: "user", content: request },
        ],
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(MERGE_TIMEOUT_MS)]),
    });
    if (!response.ok) throw new Error(`LLM マージの提供元 HTTP ${response.status}`);
    const output = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().max(400_000) }) })).min(1) }).parse(await response.json());
    return output.choices[0].message.content;
  }
}
