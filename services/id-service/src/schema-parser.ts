/**
 * YAML スキーマパーサー
 *
 * schema/*.yaml を読み込み、ユーザーデータフォーマットを解析する。
 * 依存: なし (簡易 YAML パーサー内蔵、外部ライブラリ不要)
 */

import { readFileSync, readdirSync } from "fs";
import path from "path";

// ─── Types ─────────────────────────────────────────────────

export type FieldType = "string" | "number" | "boolean" | "json" | "timestamp";

export interface FieldDef {
  type: FieldType;
  required?: boolean;
  primary?: boolean;
  unique?: boolean;
  sensitive?: boolean;
  default?: string;
  enum?: string[];
  index?: string;
  description?: string;
  ref?: string;
  listVisible?: boolean;
}

export interface CoreSchema {
  version: string;
  namespace: string;
  fields: Record<string, FieldDef>;
  sessions?: { fields: Record<string, FieldDef> };
}

export interface ServiceSchema {
  version: string;
  service: {
    id: string;
    name: string;
    description?: string;
  };
  fields: Record<string, FieldDef>;
}

export interface ParsedSchemas {
  core: CoreSchema;
  services: ServiceSchema[];
}

// ─── Simple YAML Parser ────────────────────────────────────
// yaml ライブラリ不要の軽量パーサー。
// インデントベースで key: value を解析する。

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [
    { indent: -1, obj: result },
  ];

  for (const rawLine of lines) {
    // コメントと空行をスキップ
    const commentIdx = rawLine.indexOf("#");
    const line = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;
    if (line.trim() === "") continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // key: value パース
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    // スタックを巻き戻し
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (rawValue === "" || rawValue === "|") {
      // ネストされたオブジェクト
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      // 値をパース
      parent[key] = parseValue(rawValue);
    }
  }

  return result;
}

function parseValue(raw: string): unknown {
  // 配列 [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => unquote(s));
  }

  // 真偽値
  if (raw === "true") return true;
  if (raw === "false") return false;

  // 数値
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  // 文字列 (クォート除去)
  return unquote(raw);
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ─── Schema Loader ─────────────────────────────────────────

/**
 * schema/ ディレクトリから全 YAML を読み込んでパース
 */
export function loadSchemas(schemaDir: string): ParsedSchemas {
  const files = readdirSync(schemaDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  let core: CoreSchema | null = null;
  const services: ServiceSchema[] = [];

  for (const file of files) {
    const filePath = path.join(schemaDir, file);
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseSimpleYaml(content);

    if (parsed.namespace === "core" || file === "core.yaml") {
      core = parseCoreSchema(parsed);
    } else if (parsed.service) {
      services.push(parseServiceSchema(parsed));
    }
  }

  if (!core) {
    throw new Error("[id-service] core.yaml が見つかりません");
  }

  return { core, services };
}

function parseCoreSchema(raw: Record<string, unknown>): CoreSchema {
  const fields = raw.fields as Record<string, Record<string, unknown>> | undefined;
  const sessions = raw.sessions as Record<string, unknown> | undefined;

  return {
    version: String(raw.version ?? "1"),
    namespace: String(raw.namespace ?? "core"),
    fields: normalizeFields(fields ?? {}),
    sessions: sessions
      ? { fields: normalizeFields((sessions.fields as Record<string, Record<string, unknown>>) ?? {}) }
      : undefined,
  };
}

function parseServiceSchema(raw: Record<string, unknown>): ServiceSchema {
  const svc = raw.service as Record<string, unknown>;
  const fields = raw.fields as Record<string, Record<string, unknown>> | undefined;

  return {
    version: String(raw.version ?? "1"),
    service: {
      id: String(svc.id ?? ""),
      name: String(svc.name ?? ""),
      description: svc.description ? String(svc.description) : undefined,
    },
    fields: normalizeFields(fields ?? {}),
  };
}

function normalizeFields(raw: Record<string, Record<string, unknown>>): Record<string, FieldDef> {
  const result: Record<string, FieldDef> = {};

  for (const [name, def] of Object.entries(raw)) {
    if (typeof def !== "object" || def === null) continue;
    result[name] = {
      type: (def.type as FieldType) ?? "string",
      required: def.required === true,
      primary: def.primary === true,
      unique: def.unique === true,
      sensitive: def.sensitive === true,
      default: def.default !== undefined ? String(def.default) : undefined,
      enum: Array.isArray(def.enum) ? (def.enum as string[]) : undefined,
      index: def.index ? String(def.index) : undefined,
      description: def.description ? String(def.description) : undefined,
      ref: def.ref ? String(def.ref) : undefined,
      listVisible: def.listVisible === true,
    };
  }

  return result;
}

/**
 * コアフィールドのうち sensitive でないものを返す (公開可能フィールド)
 */
export function getPublicFields(schema: CoreSchema): string[] {
  return Object.entries(schema.fields)
    .filter(([, def]) => !def.sensitive)
    .map(([name]) => name);
}

/**
 * インデックスキーのパターンを返す
 */
export function getIndexPatterns(schema: CoreSchema): Array<{ field: string; pattern: string }> {
  const indexes: Array<{ field: string; pattern: string }> = [];
  for (const [name, def] of Object.entries(schema.fields)) {
    if (def.index) {
      indexes.push({ field: name, pattern: def.index });
    }
  }
  return indexes;
}
