import { describe, expect, it } from "vitest";
import { POPUP_CLOSED_MESSAGE, loginErrorMessage } from "./login-error";

describe("loginErrorMessage (パスキーで続ける の失敗表示)", () => {
  it("popup を閉じただけならエラーを出さない", () => {
    expect(loginErrorMessage(new Error(POPUP_CLOSED_MESSAGE))).toBe("");
  });

  it("それ以外の失敗は理由をそのまま出す", () => {
    expect(loginErrorMessage(new Error("Popup blocked. Please allow popups."))).toBe("Popup blocked. Please allow popups.");
  });

  it("Error でない値は既定の文言", () => {
    expect(loginErrorMessage("x")).toBe("Authentication failed");
  });
});
