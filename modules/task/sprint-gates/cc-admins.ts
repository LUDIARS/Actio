// @spec スプリントフェーズの本人認証
/**
 * Cc の Discord で判断できる管理者の一覧 (`ACTIO_SPRINT_CC_ADMINS`)。
 * 書式は `別名:DiscordユーザーID` をカンマ区切り (例 `neco:905235114026467350`)。
 * Actio の DB に残すのは別名だけで、Discord ID は設定にしか置かない。
 * 不正な要素は黙って通さず、一覧全体を無効にする (fail closed)。
 */
export type CcAdmins = ReadonlyMap<string, string>;

const ALIAS = /^[a-z0-9_-]{1,32}$/i;
const DISCORD_ID = /^\d{17,20}$/;

export function parseCcAdmins(raw: string | undefined | null): CcAdmins {
    const admins = new Map<string, string>();
    const value = raw?.trim() ?? "";
    if (!value) return admins;
    for (const entry of value.split(",")) {
        const [alias, discordId, extra] = entry.trim().split(":").map(part => part.trim());
        if (extra !== undefined || !alias || !discordId || !ALIAS.test(alias) || !DISCORD_ID.test(discordId) || admins.has(discordId)) {
            return new Map();
        }
        admins.set(discordId, alias);
    }
    return admins;
}

/** 判断の記録に残す主体。Discord ID ではなく設定した別名から作る。 */
export function ccAdminActor(alias: string): string {
    return "cc-admin:" + alias;
}
