// @implements AT-SPRINT-CHAT-INTEGRATION
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { isLocalModeRequest } from "../../../src/auth/local-mode.js";
import { chatRecords } from "../../../src/db/chat-repository.js";
import { secretManager } from "../../../src/config/secrets.js";
import { ChatError, connectionInput, confirmIntake, type Connection, type Intake, type Surface, type Operation } from "./contracts.js";
import { ChatSetupStore } from "./setup-store.js";
import { IntakeStore } from "./intake-store.js";
import { chatMode, chatProviders } from "./providers.js";
import { conversation, type DiscussionSetting } from "./discussion.js";
import { readRecord, writeRecord, requireRevision } from "./records.js";

function param(c: Context, key: string): string { const value = c.req.param(key); if (!value) throw new ChatError("Missing route parameter", 400); return value; }
const base = "/:teamId/chat";
function actor(c: Context): string { return c.get("userId" as never) as string; }
function human(c: Context): boolean {
  const id = actor(c);
  return !!id && id !== "anonymous" && id !== "actio-local" && !isLocalModeRequest(c) && !c.get("apiClientId" as never);
}
export const chatRoutes = new Hono();
chatRoutes.use("*", bodyLimit({ maxSize: 160_000 }));
chatRoutes.onError((error, c) => {
  if (error instanceof ChatError) return c.json({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: "入力内容を確認してください" }, 400);
  return c.json({ error: "チャット処理を完了できませんでした" }, 503);
});
chatRoutes.post("/chat/local-team", async c => {
  if (!human(c)) return c.json({ error: "人間のログインが必要です" }, 403);
  const body = z.object({ name: z.string().trim().min(1).max(200) }).strict().parse(await c.req.json());
  return c.json({ id: await new ChatSetupStore(chatRecords()).createTeam(body.name, actor(c), new Date()) }, 201);
});
chatRoutes.post("/chat/local-project", async c => {
  if (!human(c)) return c.json({ error: "人間のログインが必要です" }, 403);
  const body = z.object({ code: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), name: z.string().trim().min(1).max(200), teamIds: z.array(z.string().min(1)).min(1).max(100) }).strict().parse(await c.req.json());
  return c.json({ code: await new ChatSetupStore(chatRecords()).createProject(body.code, body.name, body.teamIds, actor(c), new Date()) }, 201);
});
chatRoutes.use(base + "/*", requireTeamRole("member"));
chatRoutes.get(base + "/state", async c => {
  const records = chatRecords(), team = param(c, "teamId");
  const health = await records.list<{ error: string | null; visibilityBlocked?: boolean }>(team, "health");
  const blocked = health.some(h => h.visibilityBlocked);
  const intakes = blocked ? [] : await records.list<Intake>(team, "intake", 200);
  // The log is the source view; do not expose a stale copy after source deletion.
  const source = await Promise.all(intakes.map(i => records.get<{ deleted: boolean }>(team, "message", i.messageId)));
  return c.json({ mode: chatMode(), connections: await records.list<Connection>(team, "connection"),
    intakes: intakes.map((i, n) => source[n]?.deleted ? { ...i, content: "", review: null, sourceDeleted: true } : i),
    surfaces: await records.list<Surface>(team, "surface", 200), channels: blocked ? [] : await records.list(team, "channel", 200),
    discussionSettings: await records.list<DiscussionSetting>(team, "discussion-setting", 200),
    health, discussionHealth: await records.list(team, "discussion-health", 200),
    outbox: (await records.list<Operation>(team, "outbox", 200)).filter(o => o.state !== "sent").map(o => ({ id: o.id, state: o.state, kind: o.payload.kind, error: o.lastError })),
    canManage: human(c) && ["leader", "admin"].includes(c.get("teamRole" as never) as string),
    diConfigured: !!secretManager.get("DISCUTERE_URL") && !!secretManager.get("DISCUTERE_EXTERNAL_DISCUSSION_SECRET"),
  });
});
chatRoutes.get(base + "/logs/:channel", async c => {
  const records = chatRecords(), team = param(c, "teamId"), channel = param(c, "channel");
  if ((await records.list<{ visibilityBlocked?: boolean }>(team, "health")).some(h => h.visibilityBlocked)) throw new ChatError("接続先の閲覧権限を再確認するまでログを表示できません", 403);
  if (!await records.get(team, "channel", channel)) throw new ChatError("ログがありません", 404);
  const query = z.object({ offset: z.coerce.number().int().min(0).default(0), q: z.string().max(200).default("") }).parse(c.req.query());
  const messages = (await conversation(records, team, channel)).filter(m => !query.q || m.content.includes(query.q));
  return c.json({ messages: messages.slice(query.offset, query.offset + 50), total: messages.length,
    cursor: await records.get(team, "cursor", channel) });
});
chatRoutes.use(base + "/*", async (c, next) => {
  if (!human(c)) return c.json({ error: "人間のログインで操作してください" }, 403);
  await next();
});
chatRoutes.put(base + "/connection", requireTeamRole("leader"), async c => {
  const body = z.object({ revision: z.number().int().nonnegative(), connection: connectionInput }).strict().parse(await c.req.json());
  const value = { ...body.connection, teamId: param(c, "teamId") };
  // Secret references are administrator-controlled; a team leader must not select another team's Bot credentials.
  const prior = await chatRecords().get<Connection>(value.teamId, "connection", value.platform);
  if (c.get("teamRole" as never) !== "admin" && (!prior || prior.tokenRef !== value.tokenRef || prior.workspaceId !== value.workspaceId || prior.backlogChannelId !== value.backlogChannelId))
    throw new ChatError("初回接続とBot・接続先の設定は管理者が行ってください", 403);
  if (value.enabled) {
    const providers = chatProviders({ ...value, revision: body.revision }, c.req.raw.signal);
    try { await providers.transport.validate({ ...value, revision: body.revision }); }
    finally { providers.transport.close(); }
  }
  return c.json(await new ChatSetupStore(chatRecords()).saveConnection(value, body.revision, new Date()));
});
chatRoutes.put(base + "/discussion/:channel", requireTeamRole("leader"), async c => {
  const body = z.object({ revision: z.number().int().nonnegative(), enabled: z.boolean() }).strict().parse(await c.req.json());
  const records = chatRecords(), team = param(c, "teamId"), channelId = param(c, "channel");
  if (!await records.get(team, "channel", channelId)) throw new ChatError("管理対象のチャンネルを選択してください", 404);
  if (body.enabled && (!secretManager.get("DISCUTERE_URL") || !secretManager.get("DISCUTERE_EXTERNAL_DISCUSSION_SECRET"))) throw new ChatError("Diが未設定です。議論参加を有効にできません", 503);
  const result = await records.transaction(team, function* () {
    const old = yield* readRecord<DiscussionSetting>(team, "discussion-setting", channelId);
    requireRevision(old?.revision ?? 0, body.revision);
    const value: DiscussionSetting = { channelId, enabled: body.enabled, revision: body.revision + 1,
      enabledAt: body.enabled && !old?.enabled ? new Date().toISOString() : old?.enabledAt ?? new Date().toISOString() };
    yield* writeRecord(team, "discussion-setting", channelId, value, new Date());
    return value;
  });
  return c.json(result);
});
chatRoutes.post(base + "/intakes/:id/confirm", requireTeamRole("leader"), async c => {
  const value = confirmIntake.parse(await c.req.json());
  const taskId = await new IntakeStore(chatRecords()).confirm(param(c, "teamId"), param(c, "id"), actor(c), value, new Date(), c.get("teamRole" as never) !== "admin");
  return c.json({ taskId });
});
chatRoutes.post(base + "/outbox/:id/retry", requireTeamRole("leader"), async c => {
  const input = z.object({ expectedState: z.enum(["unknown", "failed"]), checkedExternalState: z.literal(true),
    reason: z.string().trim().min(1).max(2000) }).strict().parse(await c.req.json());
  const team = param(c, "teamId"), id = param(c, "id"), userId = actor(c), now = new Date();
  await chatRecords().transaction(team, function* () {
    const op = yield* readRecord<Operation>(team, "outbox", id);
    if (!op || op.state !== input.expectedState) throw new ChatError("配送状態が変わりました。再読み込みしてください");
    if (yield* readRecord(team, "discussion-delivery", id)) throw new ChatError("議論の発言案は再送しません。新しい会話で再判断します");
    yield* writeRecord(team, "outbox-retry", `${id}:${now.toISOString()}`, { userId, reason: input.reason, previousState: op.state }, now);
    yield* writeRecord(team, "outbox", id, { ...op, state: "queued", lastError: null }, now, "queued");
  });
  return c.json({ queued: true });
});
