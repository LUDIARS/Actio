/**
 * Custom field registry — Issue #111 D1
 *
 * プラグインが `definition.customFields: { myField: {...} }` で宣言した
 * 定義をホスト側で覚えておき、値の書き込み時に type / required /
 * options を検証する.
 */

import type { CustomFieldDefinition } from "@ludiars/schedula-sdk";

export class CustomFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomFieldError";
  }
}

interface RegisteredField extends CustomFieldDefinition {
  moduleId: string;
  key:      string;   // moduleId:fieldId
}

class CustomFieldRegistry {
  private fields = new Map<string, RegisteredField>();   // key = moduleId:fieldId

  register(moduleId: string, fieldId: string, def: CustomFieldDefinition): void {
    const key = `${moduleId}:${fieldId}`;
    this.fields.set(key, { ...def, id: fieldId, moduleId, key });
  }

  unregister(moduleId: string): void {
    for (const [k, v] of this.fields) {
      if (v.moduleId === moduleId) this.fields.delete(k);
    }
  }

  get(moduleId: string, fieldId: string): RegisteredField | undefined {
    return this.fields.get(`${moduleId}:${fieldId}`);
  }

  listAll(): RegisteredField[] { return [...this.fields.values()]; }

  /** 型 / required / options チェック. 違反なら throw. */
  validate(
    moduleId: string,
    fieldId: string,
    target: "event" | "task",
    value: unknown,
  ): void {
    const def = this.get(moduleId, fieldId);
    if (!def) {
      throw new CustomFieldError(`unknown custom field ${moduleId}:${fieldId}`);
    }
    if (def.target !== "both" && def.target !== target) {
      throw new CustomFieldError(
        `custom field ${moduleId}:${fieldId} cannot be attached to ${target}`,
      );
    }
    if (value === null || value === undefined) {
      if (def.required) {
        throw new CustomFieldError(`custom field ${moduleId}:${fieldId} is required`);
      }
      return;
    }
    switch (def.type) {
      case "text":    if (typeof value !== "string")  throwType(fieldId, "string"); break;
      case "number":  if (typeof value !== "number")  throwType(fieldId, "number"); break;
      case "boolean": if (typeof value !== "boolean") throwType(fieldId, "boolean"); break;
      case "date":    // ISO string
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          throwType(fieldId, "ISO date string");
        }
        break;
      case "select":
        if (typeof value !== "string") throwType(fieldId, "string (one of options)");
        if (def.options && !def.options.some((o) => o.value === value)) {
          throw new CustomFieldError(
            `custom field ${moduleId}:${fieldId} value "${value}" is not a valid option`,
          );
        }
        break;
      case "multi_select":
        if (!Array.isArray(value)) throwType(fieldId, "string[] (subset of options)");
        for (const v of value as unknown[]) {
          if (typeof v !== "string") throwType(fieldId, "string[] (subset of options)");
          if (def.options && !def.options.some((o) => o.value === v)) {
            throw new CustomFieldError(
              `custom field ${moduleId}:${fieldId} value "${v}" is not a valid option`,
            );
          }
        }
        break;
      case "json":
        // 任意の JSON-serialisable. 参照 cycle だけ弾く.
        try { JSON.stringify(value); }
        catch { throw new CustomFieldError(`custom field ${moduleId}:${fieldId}: value is not JSON-serialisable`); }
        break;
    }
  }

  __clearForTest(): void { this.fields.clear(); }
}

function throwType(fieldId: string, expected: string): never {
  throw new CustomFieldError(`custom field ${fieldId}: expected ${expected}`);
}

export const customFieldRegistry = new CustomFieldRegistry();
