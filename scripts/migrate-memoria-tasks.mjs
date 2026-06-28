// Memoria 個人タスク → Actio 移行スクリプト (非破壊・冪等)
//
// Memoria の既存タスクを HTTP API 経由で読み出し、Actio へ POST する。
// Memoria 側のデータは一切変更しない (read-only)。冪等性は Actio タスクの
// pluginRef = `memoria:<memoria_id>` で担保し、再実行しても二重登録しない。
//
// 使い方:
//   node scripts/migrate-memoria-tasks.mjs            # dry-run (既定。POST しない)
//   node scripts/migrate-memoria-tasks.mjs --apply    # 実際に Actio へ登録
//
// env:
//   MEMORIA_BASE  読み出し元 (既定 http://127.0.0.1:5180)
//   ACTIO_BASE    書き込み先 (既定 http://127.0.0.1:3000)
//
// 前提: Actio が新スキーマ (kind/creator_type/category 列) で起動していること。

const MEMORIA_BASE = (process.env.MEMORIA_BASE ?? "http://127.0.0.1:5180").replace(/\/$/, "");
const ACTIO_BASE = (process.env.ACTIO_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const APPLY = process.argv.includes("--apply");
// 既定は全件 (done 含む = 完全な home-of-record)。--active-only で todo/doing のみ。
const ACTIVE_ONLY = process.argv.includes("--active-only");

const PLUGIN_ID = "memoria";
const refOf = (id) => `${PLUGIN_ID}:${id}`;

async function getJson(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

// Memoria の全タスク (task + goal, done 含む) を offset ページングで取得
async function fetchMemoriaTasks() {
  const all = [];
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const { items = [] } = await getJson(
      `${MEMORIA_BASE}/api/tasks?kind=all&limit=${limit}&offset=${offset}`,
    );
    all.push(...items);
    if (items.length < limit) break;
  }
  return all;
}

// Actio 側の既存 memoria 由来タスクの pluginRef 集合 (冪等判定用)
async function fetchActioMemoriaRefs() {
  const { tasks = [] } = await getJson(
    `${ACTIO_BASE}/api/tasks?pluginId=${PLUGIN_ID}&kind=all&scope=owned`,
  );
  return new Set(tasks.map((t) => t.pluginRef).filter(Boolean));
}

function toActioPayload(t) {
  return {
    title: String(t.title ?? "").trim(),
    details: typeof t.details === "string" ? t.details : "",
    status: ["todo", "doing", "done"].includes(t.status) ? t.status : "todo",
    kind: t.kind === "goal" ? "goal" : "task",
    creator_type: t.creator_type === "ai" ? "ai" : "human",
    due_at: typeof t.due_at === "string" ? t.due_at : null,
    category: typeof t.category === "string" ? t.category : null,
    pluginId: PLUGIN_ID,
    pluginRef: refOf(t.id),
  };
}

async function main() {
  console.log(`[migrate] mode=${APPLY ? "APPLY" : "DRY-RUN"} memoria=${MEMORIA_BASE} actio=${ACTIO_BASE}`);

  let memoriaTasks;
  try {
    memoriaTasks = await fetchMemoriaTasks();
  } catch (err) {
    console.error(`[migrate] Memoria 読み出し失敗 (${MEMORIA_BASE}): ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[migrate] Memoria タスク ${memoriaTasks.length} 件`);

  let existingRefs = new Set();
  try {
    existingRefs = await fetchActioMemoriaRefs();
    console.log(`[migrate] Actio 既存 memoria 由来 ${existingRefs.size} 件 (これらはスキップ)`);
  } catch (err) {
    // dry-run は Actio 未起動でも Memoria 読み出しのプレビューだけ出せるようにする
    if (APPLY) {
      console.error(`[migrate] Actio 到達失敗 (${ACTIO_BASE}): ${err.message}`);
      console.error("[migrate] Actio が新スキーマで起動しているか確認してください。");
      process.exitCode = 1;
      return;
    }
    console.warn(`[migrate] Actio 未到達 (${ACTIO_BASE}) — dry-run のため冪等判定なしで継続: ${err.message}`);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of memoriaTasks) {
    const title = String(t.title ?? "").trim();
    if (!title) { skipped++; continue; }
    if (ACTIVE_ONLY && t.status === "done") { skipped++; continue; }
    if (existingRefs.has(refOf(t.id))) { skipped++; continue; }

    const payload = toActioPayload(t);
    if (!APPLY) {
      console.log(`DRY would create [${payload.kind}/${payload.status}] ${title}${payload.category ? ` (${payload.category})` : ""}`);
      created++;
      continue;
    }

    try {
      const res = await fetch(`${ACTIO_BASE}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        console.log(`OK ${json?.task?.id ?? "-"} [${payload.kind}/${payload.status}] ${title}`);
        created++;
      } else {
        console.log(`FAIL (${res.status}) ${title}: ${(await res.text()).slice(0, 160)}`);
        failed++;
      }
    } catch (err) {
      console.log(`FAIL (network) ${title}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[migrate] ${APPLY ? "created" : "would create"}=${created} skipped=${skipped} failed=${failed}`);
  if (!APPLY) console.log("[migrate] --apply を付けると実際に登録します。");
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(`[migrate] 予期せぬエラー: ${err?.stack ?? err}`);
  process.exitCode = 1;
});
