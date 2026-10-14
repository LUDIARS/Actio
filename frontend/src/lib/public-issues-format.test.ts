import { describe, expect, it } from "vitest";
import { formatPublicDate, isPublicPath, readProjectParam, severityLabel, statusLabel } from "./public-issues-format";

describe("public issues format", () => {
  it("renders only /public/issues outside authentication", () => {
    expect(isPublicPath("/public/issues")).toBe(true);
    expect(isPublicPath("/public/issues/")).toBe(true);
    expect(isPublicPath("/tasks")).toBe(false);
    expect(isPublicPath("/public/issuesx")).toBe(false);
  });

  it("reads a project code from the query and ignores malformed values", () => {
    expect(readProjectParam("?project=At")).toBe("At");
    expect(readProjectParam("?project=a%20b")).toBeNull();
    expect(readProjectParam("")).toBeNull();
  });

  it("labels status / severity and tolerates missing values", () => {
    expect(statusLabel("in_progress")).toBe("対応中");
    expect(statusLabel(null)).toBe("—");
    expect(severityLabel("s1")).toBe("致命");
    expect(formatPublicDate(null)).toBe("—");
    expect(formatPublicDate("not a date")).toBe("—");
  });
});
