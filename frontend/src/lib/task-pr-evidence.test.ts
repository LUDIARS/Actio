import { describe, expect, it } from "vitest";
import { taskPrViews } from "./task-pr-evidence";

const pr = { provider: "revisor", repository: "owner/repo", id: "p1", number: 1, url: null,
  head_sha: "a", reviewed_head_sha: "a", state: "open", review: "test_ok", reflection: "unknown", observed_at: "2026-09-26T00:00:00Z" };
describe("task PR display", () => {
  it("handles legacy and malformed metadata", () => {
    expect(taskPrViews(null)).toEqual([]);
    expect(taskPrViews({ pull_requests: [null, {}, { ...pr, provider: "other" }] })).toEqual([]);
  });
  it("distinguishes providers and repository identity", () => {
    const items = taskPrViews({ pull_requests: [pr, { ...pr, provider: "github" }, { ...pr, repository: "another/repo" }] });
    expect(new Set(items.map((item) => item.key)).size).toBe(3);
    expect(items[0]).toMatchObject({ state: "オープン", review: "テスト成功", reflection: "反映未確認" });
  });
  it("displays stale approval and refuses script links", () => {
    expect(taskPrViews({ pull_requests: [{ ...pr, reviewed_head_sha: "old", url: "javascript:alert(1)" }] })[0])
      .toMatchObject({ review: "再レビューが必要", url: null });
  });
});
