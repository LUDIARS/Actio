import { notificationTemplateRepo } from "../../../src/db/repository.js";

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

/**
 * Built-in default templates (used when no custom template exists in DB).
 */
const BUILTIN_TEMPLATES: Record<string, { title: string; body: string }> = {
  "reservation.created": {
    title: "「{title}」が予約されました",
    body: "{day} {period}限 - {room}",
  },
  "reservation.updated": {
    title: "予約「{title}」が変更されました",
    body: "変更内容: {day} {period}限 - {room}",
  },
  "reservation.cancelled": {
    title: "予約「{title}」がキャンセルされました",
    body: "{day} {period}限 の予約がキャンセルされました",
  },
  "reservation.reminder": {
    title: "【リマインド】{title} - {day} {period}限",
    body: "まもなく開始: {room} にて {minutes}分後",
  },
  "schedule.confirmed": {
    title: "新学期時間割が確定しました",
    body: "時間割が確定されました。確認してください。",
  },
  "schedule.changed": {
    title: "授業予定が変更されました",
    body: "{major} - {day} {period}限 ({changeType})",
  },
  "sync.conflict": {
    title: "予定が競合しています",
    body: "{day} {period}限: {conflictDetails}",
  },
  "reminder.morning": {
    title: "【朝の通知】未完了のリマインダーが{count}件あります",
    body: "{summary}",
  },
};

/**
 * Substitute {variable} placeholders in a template string.
 */
function substituteVars(template: string, vars: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const strVal = key === "day"
      ? (DAY_LABELS[Number(value)] || String(value))
      : String(value ?? "");
    result = result.replaceAll(`{${key}}`, strVal);
  }
  return result;
}

/**
 * Apply code block formatting if enabled.
 */
function applyCodeBlock(
  body: string,
  useCodeBlock: boolean,
  codeBlockLang: string | null,
  platform: string
): string {
  if (!useCodeBlock) return body;

  switch (platform) {
    case "slack":
      return `\`\`\`\n${body}\n\`\`\``;
    case "discord":
      return `\`\`\`${codeBlockLang || ""}\n${body}\n\`\`\``;
    case "line":
      // LINE doesn't support code blocks, use plain formatting
      return `---\n${body}\n---`;
    default:
      return `\`\`\`${codeBlockLang || ""}\n${body}\n\`\`\``;
  }
}

export interface RenderedTemplate {
  title: string;
  body: string;
  useCodeBlock: boolean;
  codeBlockLang: string | null;
}

/**
 * Render a notification template for a given event and platform.
 * Priority: custom DB template > built-in template > generic fallback.
 */
export async function renderNotificationTemplate(
  event: string,
  platform: string,
  vars: Record<string, unknown>
): Promise<RenderedTemplate> {
  // 1. Try to find a custom template in DB
  const customTemplate = await notificationTemplateRepo.findByEventAndPlatform(event, platform);

  if (customTemplate) {
    const title = substituteVars(customTemplate.title, vars);
    const rawBody = substituteVars(customTemplate.body, vars);
    const body = applyCodeBlock(rawBody, customTemplate.useCodeBlock, customTemplate.codeBlockLang, platform);
    return {
      title,
      body,
      useCodeBlock: customTemplate.useCodeBlock,
      codeBlockLang: customTemplate.codeBlockLang,
    };
  }

  // 2. Fall back to built-in template
  const builtin = BUILTIN_TEMPLATES[event];
  if (builtin) {
    const title = substituteVars(builtin.title, vars);
    const body = substituteVars(builtin.body, vars);
    return { title, body, useCodeBlock: false, codeBlockLang: null };
  }

  // 3. Generic fallback
  return {
    title: `通知: ${event}`,
    body: JSON.stringify(vars),
    useCodeBlock: false,
    codeBlockLang: null,
  };
}
