import { describe, expect, it } from "vitest";
import { actingForLine, parseActingFor } from "../../src/auth/acting-for.js";

describe("parseActingFor (AT-CC-ACTING-FOR)", () => {
  it("accepts discord and slack identities", () => {
    expect(parseActingFor("discord:123456789012345678")).toEqual({ platform: "discord", userId: "123456789012345678" });
    expect(parseActingFor(" slack:U01AB_CD-2 ")).toEqual({ platform: "slack", userId: "U01AB_CD-2" });
  });

  it("rejects missing, unknown and malformed values", () => {
    for (const value of [undefined, null, "", "discord:", "line:123", "discord:1:2", "discord:12\n34", "discord:a b", `discord:${"1".repeat(65)}`]) {
      expect(parseActingFor(value)).toBeNull();
    }
  });

  it("formats one audit line", () => {
    expect(actingForLine("POST", "/api/tasks", 201, { platform: "discord", userId: "42" }))
      .toBe("POST /api/tasks status=201 acting-for=discord:42");
  });
});
