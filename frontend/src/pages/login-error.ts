/**
 * ログインの popup が失敗したときに画面へ出す文言。
 * 利用者が popup を閉じただけのときはエラーにしない (空文字)。
 */
export const POPUP_CLOSED_MESSAGE = "Login popup was closed.";

export function loginErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "Authentication failed";
  return message === POPUP_CLOSED_MESSAGE ? "" : message;
}
