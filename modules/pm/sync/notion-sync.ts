/**
 * Notion Database 双方向同期
 */

import type { NotionSourceConfig, ExternalTask, PMTaskStatus, PMPriority } from "../types.js";

/** Notion API リクエストのタイムアウト (30秒) */
const NOTION_API_TIMEOUT_MS = 30_000;

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
  last_edited_time: string;
}

interface NotionProperty {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  status?: { name: string };
  select?: { name: string };
  multi_select?: { name: string }[];
  date?: { start: string | null };
  people?: { name: string }[];
}

function extractText(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  if (prop.title) return prop.title.map((t) => t.plain_text).join("");
  if (prop.rich_text) return prop.rich_text.map((t) => t.plain_text).join("");
  return "";
}

function mapNotionStatus(statusName: string | undefined): PMTaskStatus {
  if (!statusName) return "open";
  const lower = statusName.toLowerCase();
  if (lower.includes("done") || lower.includes("complete") || lower.includes("closed")) return "closed";
  if (lower.includes("review")) return "review";
  if (lower.includes("progress") || lower.includes("wip")) return "in_progress";
  return "open";
}

function mapNotionPriority(priorityName: string | undefined): PMPriority {
  if (!priorityName) return "medium";
  const lower = priorityName.toLowerCase();
  if (lower.includes("critical") || lower.includes("urgent")) return "critical";
  if (lower.includes("high")) return "high";
  if (lower.includes("low")) return "low";
  return "medium";
}

/**
 * Notion Database からタスクを取得
 */
export async function fetchNotionTasks(config: NotionSourceConfig): Promise<ExternalTask[]> {
  const { databaseId, token } = config;
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  while (true) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(NOTION_API_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Notion API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
    pages.push(...data.results);

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return pages.map((page) => {
    const props = page.properties;
    const title = extractText(props["Name"] || props["Title"] || props["タイトル"]);
    const description = extractText(props["Description"] || props["説明"]);
    const statusProp = props["Status"] || props["ステータス"];
    const priorityProp = props["Priority"] || props["優先度"];
    const dueDateProp = props["Due Date"] || props["Due"] || props["期限"];
    const assigneeProp = props["Assignee"] || props["担当者"];
    const tagsProp = props["Tags"] || props["Labels"] || props["ラベル"];

    return {
      externalId: page.id,
      externalUrl: page.url,
      title: title || "Untitled",
      description: description || null,
      status: mapNotionStatus(statusProp?.status?.name || statusProp?.select?.name),
      priority: mapNotionPriority(priorityProp?.select?.name),
      assignees: assigneeProp?.people?.map((p) => p.name) ?? [],
      labels: tagsProp?.multi_select?.map((s) => s.name) ?? [],
      dueDate: dueDateProp?.date?.start ?? null,
      milestoneExternalId: null,
      milestoneName: null,
      updatedAt: page.last_edited_time,
    };
  });
}

/**
 * Notion Page を更新 (書き戻し)
 */
export async function updateNotionPage(
  config: NotionSourceConfig,
  pageId: string,
  data: {
    title?: string;
    status?: string;
    priority?: string;
  }
): Promise<void> {
  const { token } = config;
  const properties: Record<string, unknown> = {};

  if (data.title) {
    properties["Name"] = {
      title: [{ text: { content: data.title } }],
    };
  }

  if (data.status) {
    properties["Status"] = { status: { name: data.status } };
  }

  if (data.priority) {
    properties["Priority"] = { select: { name: data.priority } };
  }

  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties }),
    signal: AbortSignal.timeout(NOTION_API_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Notion API error on update: ${res.status} ${res.statusText}`);
  }
}
