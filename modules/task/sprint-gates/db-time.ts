/**
 * Terpsichore の taskSnapshot は deadline / updatedAt を数値 (epoch 秒) で受ける。
 * SQLite は秒の整数を返すが、PostgreSQL の timestamp 列は "YYYY-MM-DD HH:MM:SS.mmm"
 * (UTC、タイムゾーン表記なし) の文字列か Date で返るため、ここで秒へ揃える。
 */
export function toEpochSeconds(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? Math.floor(value.getTime() / 1000) : null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
        const iso = trimmed.replace(" ", "T");
        const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : iso + "Z");
        return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
    }
    return null;
}
