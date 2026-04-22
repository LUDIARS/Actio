/**
 * @ludiars/schedula-sdk
 *
 * Actio モジュール実装者向けの公開 API。
 *
 * 使い方:
 * ```ts
 * import { defineModule } from "@ludiars/schedula-sdk";
 *
 * export default defineModule({
 *   id: "voting",
 *   name: "投票・日程調整",
 *   schedulaApiVersion: "^1.0.0",
 *   scope: "per-group",
 *   tables: { ... },
 *   userData: { ... },
 *   routes: (app, ctx) => { ... },
 *   wsCommands: { ... },
 * });
 * ```
 */

export { defineModule } from "./define.js";
export type {
  ModuleDefinition,
  ModuleManifest,
  ModuleContext,
  ModuleScope,
  UserDataColumn,
  UserDataColumnType,
  UserIdentity,
  UserIdentityApi,
  UserDataApi,
  CallerScopedUserDataApi,
  OAuthApi,
  OAuthToken,
  OAuthTokenInput,
  DbApi,
  WsApi,
  SecretsApi,
  AuditLogFn,
  ModulesApi,
  EventBusApi,
  EventHandler,
  PermissionsApi,
  WsCommandHandler,
  WsCommandDefinition,
  WsCommandEntry,
  WsRequiredRole,
  CustomFieldType,
  CustomFieldDefinition,
  WorkflowDefinition,
  WorkflowTransition,
  RoutesFactory,
  Lifecycle,
  DrizzleTableLike,
} from "./types.js";
