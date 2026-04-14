/**
 * Example Module (Phase 1 PoC)
 *
 * @ludiars/schedula-sdk の動作を確認するための最小モジュール。
 * 将来的には独立リポジトリ (@ludiars/schedula-module-example) として切り出す。
 */

import { defineModule } from "@ludiars/schedula-sdk";

export default defineModule({
  id: "example",
  name: "Example Module (PoC)",
  description: "Phase 1 で SDK 動作を確認するための例示モジュール",
  version: "0.1.0",
  schedulaApiVersion: "^1.0.0",
  scope: "global",

  userData: {
    greetingStyle: {
      type: "text",
      description: "挨拶スタイル (formal/casual)",
      defaultValue: "casual",
    },
  },

  basePath: "/api/example",

  routes: (app, ctx) => {
    app.get("/hello", async (c) => {
      return c.json({
        moduleId: ctx.moduleId,
        message: "Hello from example module (via SDK)",
      });
    });

    app.get("/hello/me", async (c) => {
      const userId = c.req.header("x-user-id");
      if (!userId) return c.json({ error: "missing x-user-id (test header)" }, 400);
      const user = await ctx.users.get(userId);
      return c.json({
        moduleId: ctx.moduleId,
        greeting: `Hello, ${user.name} (role: ${user.role})`,
      });
    });
  },

  wsCommands: {
    ping: async (userId, _payload, ctx) => {
      const user = await ctx.users.get(userId);
      ctx.audit(userId, "example.ping", `pinged by ${user.name}`);
      return { pong: true, userId, moduleId: ctx.moduleId, ts: Date.now() };
    },
  },

  onInstall: async (ctx) => {
    console.log(`[example] onInstall called (moduleId=${ctx.moduleId})`);
  },

  onEnable: async (ctx, scope) => {
    console.log(`[example] onEnable scope=${scope}`);
  },

  onDisable: async (ctx, scope) => {
    console.log(`[example] onDisable scope=${scope}`);
  },

  onUserOptout: async (_ctx, userId) => {
    console.log(`[example] onUserOptout for ${userId} (no module data to purge)`);
  },
});
