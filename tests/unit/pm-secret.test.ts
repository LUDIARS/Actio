import { describe, expect, it } from "vitest";
import { openGitHubConfig, publicSourceConfig, sealSourceConfig, SourceConfigError, toPublicProject } from "../../modules/pm/secret/source-config.js";
import { isSealedToken, openToken, PmSecretKeyMissingError, sealToken } from "../../modules/pm/secret/token-box.js";

const key = () => "k".repeat(40);
const noKey = () => undefined;

describe("token box (AT-PM-SECRET)", () => {
  it("round-trips and never stores the plain token", () => {
    const sealed = sealToken("ghp_secret", key);
    expect(isSealedToken(sealed)).toBe(true);
    expect(sealed).not.toContain("ghp_secret");
    expect(openToken(sealed, key)).toBe("ghp_secret");
    expect(sealToken("ghp_secret", key)).not.toBe(sealed);
  });

  it("refuses to store without ACTIO_CONFIG_KEY", () => {
    expect(() => sealToken("t", noKey)).toThrow(PmSecretKeyMissingError);
  });

  it("reads legacy plain tokens as they are", () => {
    expect(openToken("ghp_legacy", noKey)).toBe("ghp_legacy");
  });

  it("rejects a tampered ciphertext", () => {
    const sealed = sealToken("t", key);
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => openToken(tampered, key)).toThrow();
  });
});

describe("source config", () => {
  it("seals the token and keeps the previous one when omitted", () => {
    const first = sealSourceConfig("github", { owner: "LUDIARS", repo: "Actio", token: "ghp_1" }, null, key);
    expect(openGitHubConfig(first, key)).toEqual({ owner: "LUDIARS", repo: "Actio", token: "ghp_1" });
    const updated = sealSourceConfig("github", { owner: "LUDIARS", repo: "Other" }, first, key);
    expect(updated.token).toBe(first.token);
    expect(updated.repo).toBe("Other");
  });

  it("re-seals a legacy plain token on update", () => {
    const updated = sealSourceConfig("github", { owner: "o", repo: "r" }, { owner: "o", repo: "r", token: "ghp_legacy" }, key);
    expect(isSealedToken(updated.token)).toBe(true);
    expect(openGitHubConfig(updated, key).token).toBe("ghp_legacy");
  });

  it("validates the shape per source", () => {
    expect(() => sealSourceConfig("github", { owner: "a/b", repo: "r", token: "t" }, null, key)).toThrow(SourceConfigError);
    expect(() => sealSourceConfig("notion", { databaseId: "abc" }, null, key)).toThrow(SourceConfigError);
    expect(() => sealSourceConfig("github", { owner: "a", repo: "r", token: "t", extra: 1 }, null, key)).toThrow(SourceConfigError);
  });

  it("hides the token from API responses", () => {
    const stored = { owner: "o", repo: "r", token: "enc:v1:..." };
    expect(publicSourceConfig(stored)).toEqual({ owner: "o", repo: "r", hasToken: true });
    expect(JSON.stringify(toPublicProject({ id: "p", sourceConfig: stored }))).not.toContain("enc:v1");
  });
});
