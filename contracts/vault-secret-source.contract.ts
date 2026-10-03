import { LOCAL_SETTING_KEYS } from "../src/config/local-config.js";

type Result = { ok: false } | { ok: true; source: { keys: string[] } };
export default {
  post(result: Result, keys: string): true | string {
    const expected = [...new Set(keys.split(/[\s,]+/).filter(Boolean))];
    const valid = expected.length > 0 && expected.length <= 64 && expected.every(
      key => /^[A-Z][A-Z0-9_]{0,63}$/.test(key) && !LOCAL_SETTING_KEYS.has(key));
    if (!valid) return !result.ok || "invalid or local keys must be rejected";
    return result.ok && Object.keys(result.source).join() === "keys"
      && JSON.stringify(result.source.keys) === JSON.stringify(expected)
      || "valid keys must be normalized without provider coordinates";
  },
};
