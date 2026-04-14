/**
 * Voting module (SDK-based)
 *
 * 旧実装: `modules/voting/routes.ts` + `src/ws/commands/voting.ts`
 * 新実装: このファイル + `./routes.ts` + `./ws-commands.ts`
 *
 * 将来的に独立リポジトリ `@ludiars/schedula-module-voting` に切り出す。
 */

import { defineModule } from "@ludiars/schedula-sdk";
import { registerRoutes } from "./routes.js";
import { wsCommands } from "./ws-commands.js";

export default defineModule({
  id: "voting",
  name: "投票・日程調整",
  description: "候補日時を投票で決定する。自動回答 (空き時間を検出) もサポート",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "per-group",

  basePath: "/api/voting",
  routes: registerRoutes,
  wsCommands,

  onUserOptout: async (_ctx, userId) => {
    // opt-out 時は該当ユーザーの投票を全削除 (個人データ保管禁止ルール)
    const { voteRepo } = await import("../../src/db/repository.js");
    await voteRepo.deleteByUserId(userId);
  },
});
