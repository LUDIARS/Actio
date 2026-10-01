/**
 * PM プロジェクトの接続設定の保存・復元・公開形 (completion.md AT-PM-SECRET)
 *
 * - 保存: token を暗号化する。更新で token を省略したら保存済みの値を引き継ぐ。
 * - 復元: 同期処理に渡す直前だけ平文に戻す。
 * - 公開: API・WS の応答から token を除き、hasToken だけを返す。
 */

import { z } from "zod";
import type { GitHubSourceConfig, NotionSourceConfig, PMSource } from "../types.js";
import { isSealedToken, openToken, sealToken, type KeySource } from "./token-box.js";

const githubName = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);

const githubInput = z.object({
  owner: githubName,
  repo: githubName,
  token: z.string().min(1).max(500).optional(),
}).strict();

const notionInput = z.object({
  databaseId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  token: z.string().min(1).max(500).optional(),
}).strict();

export class SourceConfigError extends Error {}

function resealPrevious(previousToken: string | undefined, keySource?: KeySource): string | undefined {
  if (!previousToken || isSealedToken(previousToken)) return previousToken;
  return sealToken(previousToken, keySource);
}

/**
 * 入力を検証して保存形にする。token が無ければ previous の暗号文を使い、どちらも無ければ拒否する。
 */
export function sealSourceConfig(
  source: PMSource,
  input: unknown,
  previous: Record<string, string> | null,
  keySource?: KeySource,
): Record<string, string> {
  const parsed = (source === "github" ? githubInput : notionInput).safeParse(input);
  if (!parsed.success) throw new SourceConfigError(`sourceConfig が不正です: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const { token, ...rest } = parsed.data as Record<string, string | undefined>;
  // 旧データの平文トークンは、この更新で暗号化し直す
  const sealed = token ? sealToken(token, keySource) : resealPrevious(previous?.token, keySource);
  if (!sealed) throw new SourceConfigError("sourceConfig.token は必須です");
  return { ...(rest as Record<string, string>), token: sealed };
}

export function openGitHubConfig(stored: Record<string, string>, keySource?: KeySource): GitHubSourceConfig {
  return { owner: stored.owner ?? "", repo: stored.repo ?? "", token: openToken(stored.token ?? "", keySource) };
}

export function openNotionConfig(stored: Record<string, string>, keySource?: KeySource): NotionSourceConfig {
  return { databaseId: stored.databaseId ?? "", token: openToken(stored.token ?? "", keySource) };
}

export type PublicSourceConfig = Record<string, string | boolean>;

export function publicSourceConfig(stored: Record<string, string>): PublicSourceConfig {
  const { token, ...rest } = stored;
  return { ...rest, hasToken: typeof token === "string" && token.length > 0 };
}

/** プロジェクト行を応答用に変換する (token を伏せる)。 */
export function toPublicProject<T extends { sourceConfig: Record<string, string> }>(
  project: T,
): Omit<T, "sourceConfig"> & { sourceConfig: PublicSourceConfig } {
  return { ...project, sourceConfig: publicSourceConfig(project.sourceConfig) };
}
