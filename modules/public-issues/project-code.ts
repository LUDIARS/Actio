/** 公開面の `project` パラメータの検証。 形式は Cc のプロジェクト同期と同じ (cc-project-parse)。 */
import { CODE_PATTERN } from "../task/team/cc-project-parse.js";

export function isPublicProjectCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}
