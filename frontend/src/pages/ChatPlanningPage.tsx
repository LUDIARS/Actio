import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { planningApi, type Team } from "../lib/planning-api";
import { request } from "../lib/api";
import { chatApi, chatBase, type ChatState, type ChatLog } from "../lib/chat-api";
import { ChatConnectionForm } from "../components/planning/ChatConnectionForm";
import { ChatIntakeForm } from "../components/planning/ChatIntakeForm";
import { ChatRetryForm } from "../components/planning/ChatRetryForm";
import "./ChatPlanningPage.css";

export function ChatPlanningPage() {
  const [params, setParams] = useSearchParams(); const team = params.get("teamId") ?? "";
  const [teams, setTeams] = useState<Team[]>([]), [state, setState] = useState<ChatState | null>(null);
  const [error, setError] = useState(""), [version, setVersion] = useState(0);
  const [channel, setChannel] = useState(""), [offset, setOffset] = useState(0), [query, setQuery] = useState("");
  const [logs, setLogs] = useState<ChatLog | null>(null);
  const [teamName, setTeamName] = useState(""), [projectCode, setProjectCode] = useState(""), [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => setVersion(v => v + 1);
  useEffect(() => { let alive = true; void planningApi.teams().then(r => { if (alive) setTeams(r.teams); }).catch(e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [version]);
  useEffect(() => {
    setState(null); setChannel(""); setOffset(0); if (!team) return;
    const controller = new AbortController();
    void chatApi.state(team, controller.signal).then(setState).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [team, version]);
  useEffect(() => {
    setLogs(null); if (!team || !channel) return;
    const controller = new AbortController();
    void chatApi.logs(team, channel, offset, query, controller.signal).then(setLogs).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [team, channel, offset, query, version]);
  async function action(work: () => Promise<unknown>) { setBusy(true); setError(""); try { await work(); reload(); } catch (e) { setError(String(e)); } finally { setBusy(false); } }
  return <main className="chat-planning"><h1>チャットとバックログ</h1>
    <p><Link to={`/tasks/planning?teamId=${encodeURIComponent(team)}`}>スプリント計画・レビュー・振り返りへ</Link></p>
    <p>受付チャンネルでは <code>++バックログ追加 内容</code>、<code>@Bot バックログ追加 内容</code>、登録済みの <code>/backlog add</code> が使えます。元投稿への返信で <code>++バックログ</code>、コマンドのメッセージリンク指定、投稿メニューの「バックログに追加」も使えます。同じ受付チャンネルの投稿を指定してください。受付結果は公開し、不足事項への補足は確認スレッドで受け付けます。通常の会話は登録しません。</p>
    <label>チーム<select value={team} onChange={e => setParams({ teamId: e.target.value })}><option value="">選択してください</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name ?? t.id}</option>)}</select></label>
    <details><summary>Ccを使わずチームを作成</summary><form onSubmit={e => { e.preventDefault(); void action(async () => { const result = await request<{ id: string }>("/api/teams/chat/local-team", { method: "POST", body: JSON.stringify({ name: teamName }) }); setParams({ teamId: result.id }); }); }}><label>チーム名<input required value={teamName} onChange={e => setTeamName(e.target.value)} /></label><button disabled={busy}>作成</button></form></details>
    {error && <p role="alert">{error}</p>}
    {state && <><p>接続経路: {state.mode === "concordia" ? "Cc経由" : "Discord Bot直接"} ／ Di: {state.diConfigured ? "設定あり" : "未設定"}</p>
      {state.canManage && state.mode === "discord" && <details><summary>Discordコマンドを登録</summary><p>Botのシークレット参照名に <code>_PUBLIC_KEY</code> を付けた設定へDiscordの公開鍵を保存し、Developer Portalでこの公開HTTPSパスをInteractions Endpointに設定してください: <code>/api/chat/commands/discord/{team}/interactions</code>。ローカル専用の配備では外部から到達できません。</p><button disabled={busy} onClick={() => void action(() => chatApi.registerCommands(team))}>追加コマンドを登録</button></details>}
      {[...state.health, ...state.discussionHealth].filter(h => h.error).map((h, i) => <p role="status" key={i}>{h.error}（{h.at}）</p>)}
      {state.canManage && <><ChatConnectionForm key={`${team}:${state.connections[0]?.revision ?? 0}`} team={team} value={state.connections[0]} saved={reload} />
      <details><summary>このチームにプロジェクトを登録</summary><form onSubmit={e => { e.preventDefault(); void action(() => request("/api/teams/chat/local-project", { method: "POST", body: JSON.stringify({ code: projectCode, name: projectName, teamIds: [team] }) })); }}><label>コード<input required value={projectCode} onChange={e => setProjectCode(e.target.value)} /></label><label>名前<input required value={projectName} onChange={e => setProjectName(e.target.value)} /></label><button disabled={busy}>登録</button></form></details></>}
      <h2>受付と内容確認</h2>{!state.intakes.length && <p>受付はありません。</p>}{state.intakes.map(i => <details key={i.id}><summary>{i.review?.title ?? i.id.slice(0, 8)} — {i.state}</summary><pre>{i.sourceDeleted ? "元投稿は削除されています" : i.content}</pre>{i.reviewError && <p role="status">{i.reviewError}</p>}{i.review && <ul>{[...i.review.questions, ...i.review.concerns].map((q, n) => <li key={n}>{q}</li>)}</ul>}{i.taskId ? <p>登録済み: {i.taskId}</p> : state.canManage && <ChatIntakeForm key={i.revision} team={team} intake={i} saved={reload} />}</details>)}
      <h2>会話ログ・議論参加</h2><p>「議論に乗る」は既定OFFです。ONにすると新しい人間の投稿をDiが読み、必要なときだけ発言します。</p>
      <label>チャンネル／スレッド<select value={channel} onChange={e => { setChannel(e.target.value); setOffset(0); }}><option value="">選択してください</option>{state.channels.map(c => <option key={c.id} value={c.id}>{c.parentId ? "スレッド: " : "チャンネル: "}{c.id}</option>)}</select></label>
      {channel && state.canManage && <label><input type="checkbox" disabled={busy} checked={state.discussionSettings.find(s => s.channelId === channel)?.enabled ?? false} onChange={e => { const setting = state.discussionSettings.find(s => s.channelId === channel); void action(() => request(`${chatBase(team)}/discussion/${encodeURIComponent(channel)}`, { method: "PUT", body: JSON.stringify({ enabled: e.target.checked, revision: setting?.revision ?? 0 }) })); }} />議論に乗る</label>}
      {channel && <><label>ログ検索<input value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }} /></label><p>{logs?.cursor?.complete ? "取込済み" : "取込途中・未確認"} {logs?.cursor?.at}</p>{logs?.messages.map(m => <article key={m.id}><small>{m.bot ? "Bot" : "参加者"} · {m.occurredAt}{m.editedAt ? "（編集済み）" : ""}</small><pre>{m.deleted ? "削除済み" : m.content}</pre><a href={m.url} target="_blank" rel="noreferrer">元投稿</a>{!m.deleted && m.attachments.map((a, i) => <p key={i}><a href={a.url} target="_blank" rel="noreferrer">添付: {a.name}</a></p>)}</article>)}<button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>前へ</button><button disabled={!logs || offset + 50 >= logs.total} onClick={() => setOffset(offset + 50)}>次へ</button></>}
      <h2>スプリント保管と配送</h2>{state.surfaces.map(s => <p key={s.sprintId}>{s.sprintId}: {s.state} ／ ログ{s.logCaughtUp ? "取込済み" : "取込待ち"}</p>)}{state.outbox.map(o => <div key={o.id}><p>{o.kind}: {o.state} {o.error}</p>{state.canManage && <ChatRetryForm team={team} id={o.id} state={o.state} saved={reload} />}</div>)}<p>Discordの保管は書込停止とカテゴリ移動です。管理者権限による操作は例外です。</p><button onClick={reload}>最新状態を取得</button>
    </>}
  </main>;
}
