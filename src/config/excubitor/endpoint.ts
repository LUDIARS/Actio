/**
 * Excubitor の場所と secret-agent トークンの解決。
 *
 * URL は Excubitor が catalog から導出して全サービスへ注入する `EXCUBITOR_URL` だけを使う
 * (ポートを Actio に書かない)。トークンは Excubitor が発行したものを同じ PC から読むだけで、
 * Actio は保存しない。規約は Excubitor spec/feature/secret-agent.md。
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

const EXCUBITOR_TIMEOUT_MS = 10_000;

export class ExcubitorUnavailableError extends Error {
  constructor(readonly code: "no_endpoint" | "no_token" | "unreachable", message: string) {
    super(message);
    this.name = "ExcubitorUnavailableError";
  }
}

export function excubitorBaseUrl(env: Env = process.env): string {
  const url = env.EXCUBITOR_URL?.trim().replace(/\/$/, "");
  if (!url) throw new ExcubitorUnavailableError("no_endpoint", "EXCUBITOR_URL is not injected; start Actio through Excubitor");
  return url;
}

function agentTokenPath(env: Env): string {
  const override = env.EXCUBITOR_AGENT_TOKEN_PATH?.trim();
  if (override) return override;
  const base = env.APPDATA || join(homedir(), ".config");
  return join(base, "Excubitor", "secret-agent.token");
}

export function excubitorAgentToken(env: Env = process.env): string {
  const injected = env.EXCUBITOR_AGENT_TOKEN?.trim();
  if (injected) return injected;
  const path = agentTokenPath(env);
  const token = existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  if (!token) throw new ExcubitorUnavailableError("no_token", "Excubitor secret-agent token was not found");
  return token;
}

/** Excubitor への要求を 1 回送る。届かない場合だけ ExcubitorUnavailableError にする。 */
export async function excubitorFetch(path: string, init: RequestInit, env: Env = process.env): Promise<Response> {
  const url = `${excubitorBaseUrl(env)}${path}`;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(EXCUBITOR_TIMEOUT_MS) });
  } catch {
    throw new ExcubitorUnavailableError("unreachable", "Excubitor did not respond");
  }
}
