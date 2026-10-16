/**
 * @actio/id-service — ライブラリとしてのエクスポート
 *
 * スタンドアロンサーバーとしても、
 * 他サービスに組み込んでも使える。
 */

// Schema
export { loadSchemas, getPublicFields, getIndexPatterns } from "./schema-parser.js";
export type { CoreSchema, ServiceSchema, FieldDef, FieldType, ParsedSchemas } from "./schema-parser.js";

// KVS
export { createRedisKvs, createMemoryKvs, UserKvsRepo, SessionKvsRepo, ProfileKvsRepo } from "./kvs.js";
export type { KvsEngine, UserData, SessionData } from "./kvs.js";

// Routes
export { createIdServiceRoutes } from "./routes.js";
export type { IdServiceRouteConfig } from "./routes.js";

// Migration
export { RepoScanner, scanAndGenerateConfig } from "./migration/scanner.js";
export type { DetectedSchema, DetectedField, MigrationConfig } from "./migration/scanner.js";
