import { useState, type FormEvent } from "react";
import { request } from "../../lib/api";
import { chatBase, type ChatConnection } from "../../lib/chat-api";

export function ChatConnectionForm({ team, value, saved }: { team: string; value?: ChatConnection; saved: () => void }) {
  const [form, setForm] = useState<ChatConnection>(value ?? { platform: "discord", workspaceId: "", backlogChannelId: "", dailyAt: "09:00", timezone: "Asia/Tokyo", enabled: false, joinDiscussion: false, revision: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { revision, platform, workspaceId, backlogChannelId, categoryId, archiveCategoryId, tokenRef, dailyAt, timezone, enabled } = form;
      const connection = { platform, workspaceId, backlogChannelId, categoryId, archiveCategoryId, tokenRef, dailyAt, timezone, enabled, joinDiscussion: false };
      await request(`${chatBase(team)}/connection`, { method: "PUT", body: JSON.stringify({ revision, connection }) }); saved();
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={e => void submit(e)}>
    <h2>チャット接続</h2><p>通常チャンネルを指定してください。初回接続は管理者が設定します。Botの秘密値は配備設定に保存し、ここには参照名を入力します。</p>
    <label>接続先 <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value as ChatConnection["platform"] })}><option value="discord">Discord</option><option value="slack">Slack（Cc経由）</option></select></label>
    {([['workspaceId', 'サーバー／ワークスペースID'], ['backlogChannelId', '受付チャンネルID'], ['categoryId', '作成先カテゴリID'], ['archiveCategoryId', '保管カテゴリID'], ['tokenRef', 'Botシークレット参照名'], ['dailyAt', '朝サマリの時刻'], ['timezone', 'タイムゾーン']] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key] ?? ""} onChange={e => setForm({ ...form, [key]: e.target.value || undefined })} required={['workspaceId', 'backlogChannelId', 'dailyAt', 'timezone'].includes(key)} /></label>)}
    <label><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />受付・投稿を有効にする</label>
    <p>「議論に乗る」はチャンネル／スレッドごとに設定します。通常の会話はバックログ登録されません。</p>
    <button disabled={busy}>保存</button>{error && <p role="alert">{error}</p>}
  </form>;
}
