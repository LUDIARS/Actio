import { createHash } from "node:crypto";
import { z } from "zod";

const specSchema = z.object({ id: z.string(), projectId: z.string(), code: z.string(), title: z.string(),
  description: z.string().nullable(), status: z.string(), version: z.number(), priority: z.string(),
  preconditions: z.array(z.string()).optional(), postconditions: z.array(z.string()).optional(),
});
const detailSchema = z.object({ spec: specSchema, targets: z.array(z.unknown()),
  acceptance: z.array(z.object({ text: z.string(), enabled: z.boolean(), kind: z.string().optional() }).passthrough()) });
export type ReviewedSpec = z.infer<typeof detailSchema> & { fingerprint: string };

/** Only the operator-configured service is contacted; request bodies cannot choose a host. */
export class PraeformaClient {
  constructor(private readonly baseUrl: string, private readonly token?: string) {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("PRAEFORMA_URL が不正です");
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
    if (!response.ok) throw new Error(`Pf との接続に失敗しました (HTTP ${response.status})`);
    return response.json();
  }

  async projects(): Promise<{ id: string; name: string }[]> {
    const items: { id: string; name: string }[] = [];
    for (let offset = 0; ; offset += 50) {
      const page = z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) })
        .parse(await this.get(`/api/projects?limit=50&offset=${offset}`));
      items.push(...page.items);
      if (page.items.length < 50) return items;
      if (offset >= 9950) throw new Error("Pf プロジェクト件数が取得上限を超えました");
    }
  }

  async specs(projectId: string): Promise<z.infer<typeof specSchema>[]> {
    const items: z.infer<typeof specSchema>[] = [];
    for (let offset = 0; ; offset += 50) {
      const page = z.object({ items: z.array(specSchema) }).parse(await this.get(`/api/projects/${encodeURIComponent(projectId)}/specs?limit=50&offset=${offset}`));
      items.push(...page.items);
      if (page.items.length < 50) return items;
      if (offset >= 9950) throw new Error("Pf 仕様件数が取得上限を超えました");
    }
  }

  async detail(projectId: string, specId: string): Promise<ReviewedSpec> {
    const detail = detailSchema.parse(await this.get(`/api/projects/${encodeURIComponent(projectId)}/specs/${encodeURIComponent(specId)}`));
    if (detail.spec.projectId !== projectId || detail.spec.id !== specId) throw new Error("Pf 仕様の所属が一致しません");
    return { ...detail, fingerprint: createHash("sha256").update(JSON.stringify(detail)).digest("hex") };
  }
}
