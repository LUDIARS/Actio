import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { secretsApi } from "../lib/api";

interface SecretKey { key: string; scope: "shared" | "personal"; hasValue: boolean }

/** 外部secretの参照と再取得。値の編集は外部ストアで行う。 */
export function SecretsPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [keys, setKeys] = useState<SecretKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await secretsApi.getStatus();
      setEnabled(status.externalProviderEnabled);
      setKeys(status.externalProviderEnabled ? (await secretsApi.listKeys()).keys : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (user?.role === "admin") void loadData(); }, [loadData, user?.role]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      await secretsApi.refresh();
      await loadData();
    } catch {
      setError("シークレットの再取得に失敗しました。取得元の設定を確認してください。");
    } finally {
      setRefreshing(false);
    }
  }

  if (user?.role !== "admin") return <div style={{ padding: "2rem" }}>管理者権限が必要です</div>;
  return <main style={{ padding: "2rem" }}>
    <h1>シークレット</h1>
    <p>Vault・SSMから受け取ったキーを確認できます。値の作成・変更・削除は取得元で行ってください。</p>
    {error && <p role="alert">{error}</p>}
    {loading ? <p>読み込み中...</p> : !enabled ? <p>外部シークレットの取得は設定されていません。Vaultを利用する場合は初回設定で受け取るキーを指定してください。</p> : <>
      <button disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "再取得中..." : "シークレットを再取得"}</button>
      <table style={{ width: "100%", marginTop: "1rem" }}>
        <thead><tr><th>キー</th><th>スコープ</th><th>値</th></tr></thead>
        <tbody>{keys.map(entry => <tr key={entry.key}><td>{entry.key}</td><td>{entry.scope}</td><td>{entry.hasValue ? "設定済み" : "空"}</td></tr>)}</tbody>
      </table>
      {keys.length === 0 && <p>取得済みのキーはありません。</p>}
    </>}
  </main>;
}
