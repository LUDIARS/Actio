import { LOCAL_SETTING_KEYS } from "../src/config/local-config.js";

export default {
  post(result: Map<string, string>, source: { keys: string[] }): true | string {
    return result instanceof Map && [...result].every(([key, value]) =>
      source.keys.includes(key) && !LOCAL_SETTING_KEYS.has(key) && typeof value === "string")
      || "resolved secrets must be a requested non-local string subset";
  },
};
