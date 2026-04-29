/**
 * Placement hook forwarder.
 *
 * 現状の action_type サポート:
 *   - "webhook": action_config = { url: string, method?: string, headers?: object }
 *
 * 将来追加候補: "task" (Actio task 作成), "notify" (notification module)。
 * fire-and-forget で response はログにのみ残す。
 */

export interface HookFireInput {
  hookId: string;
  userId: string;
  placeId: string;
  event: "enter" | "leave";
  actionType: string;
  actionConfig: Record<string, unknown>;
  ts: Date;
}

export interface HookFireResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function fireHook(input: HookFireInput): Promise<HookFireResult> {
  if (input.actionType === "webhook") {
    const url = (input.actionConfig.url as string | undefined) ?? "";
    if (!url || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: "invalid webhook url" };
    }
    const method = ((input.actionConfig.method as string | undefined) ?? "POST").toUpperCase();
    const customHeaders = (input.actionConfig.headers as Record<string, string> | undefined) ?? {};

    const payload = {
      hookId: input.hookId,
      userId: input.userId,
      placeId: input.placeId,
      event: input.event,
      ts: input.ts.toISOString(),
    };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Actio-Placement/1.0",
          ...customHeaders,
        },
        body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  return { ok: false, error: `unsupported action_type: ${input.actionType}` };
}
