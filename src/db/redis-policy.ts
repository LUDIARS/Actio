/**
 * Redis 接続の振る舞い (純関数)。
 *
 * Redis はキャッシュ専用で、止まっていても Actio は動き続ける。そのために:
 * - 再接続は諦めない。上限で間隔を頭打ちにして、Redis の復旧を自力で拾う
 *   (2026-09-24: 5 回で諦めて、Redis 復旧後も Actio 再起動まで切断のままだった)
 * - 使ってよいのは ready の時だけ。それ以外は呼び出し側がキャッシュ無しで続ける
 * - 1 コマンドの待ちに上限を付け、応答しない Redis で要求を止めない
 */

/** 再接続の間隔の上限 (ms) */
export const REDIS_MAX_RECONNECT_DELAY_MS = 30_000;
/** 1 コマンドの待ち上限 (ms)。超えたらそのコマンドは失敗扱い (呼び出し側はキャッシュ無しで続行) */
export const REDIS_COMMAND_TIMEOUT_MS = 1_000;
/** TCP 接続の待ち上限 (ms) */
export const REDIS_CONNECT_TIMEOUT_MS = 3_000;

/** times 回目の再接続までの待ち (ms)。null を返さない = 再接続を諦めない。 */
export function redisReconnectDelay(times: number): number {
  return Math.min(Math.max(times, 1) * 500, REDIS_MAX_RECONNECT_DELAY_MS);
}

/** 再接続ログを間引くか。最初の数回と、以後は 20 回ごとだけ出す。 */
export function shouldLogReconnect(times: number): boolean {
  return times <= 3 || times % 20 === 0;
}

/** コマンドを送ってよい状態か。ready 以外 (connect / reconnecting / end 等) では使わない。 */
export function isRedisUsable(status: string): boolean {
  return status === "ready";
}

/**
 * 接続時の認証オプション。パスワードは REDIS_URL に埋め込まず REDIS_PASSWORD で別に渡す
 * (URL を共有 Vault の共通値のまま使い回すため)。空なら URL 側の指定 (無ければ認証無し) に任せる。
 * ioredis は URL にパスワードがあればそちらを優先するので、REDIS_URL にはパスワードを入れない。
 */
export function redisAuthOptions(password: string | undefined): { password?: string } {
  return password ? { password } : {};
}
