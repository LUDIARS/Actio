import { useEffect, useState } from "react";
import { pmApi } from "../../lib/api";
import type { PMReminderSettings, PMReminderTestResult } from "../../lib/api-types";

/** リマインダー設定 (納期警告・超過・日次レポート)。保存値はサーバー側でも検証する。 */
export function PMReminderSettingsPanel({ projectId }: { projectId: string }) {
  const [settings, setSettings] = useState<PMReminderSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PMReminderTestResult | null>(null);

  useEffect(() => {
    pmApi.getReminders(projectId).then(setSettings).catch((err: Error) => setMessage(`読み込みエラー: ${err.message}`));
  }, [projectId]);

  if (!settings) return message ? <p className="text-error">{message}</p> : null;

  const update = <K extends keyof PMReminderSettings>(key: K, value: PMReminderSettings[K]) => {
    setSettings({ ...settings, [key]: value });
    setMessage("");
  };

  const save = async () => {
    setSaving(true);
    try {
      setSettings(await pmApi.updateReminders(projectId, settings));
      setMessage("保存しました");
    } catch (err) {
      setMessage(`保存エラー: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    try {
      setPreview(await pmApi.testReminders(projectId));
    } catch (err) {
      setMessage(`確認エラー: ${(err as Error).message}`);
    }
  };

  return (
    <div className="card" style={{ padding: "0.75rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
      <h4 style={{ marginTop: 0 }}>リマインダー</h4>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <label>
          納期の
          <input
            type="number" min={0} max={30} value={settings.deadlineWarningDays}
            onChange={(e) => update("deadlineWarningDays", Number(e.target.value))}
            style={{ width: "4rem", margin: "0 0.25rem" }}
          />
          日前から警告
        </label>
        <label>
          通知時刻
          <input type="time" value={settings.dailyCheckTime} onChange={(e) => update("dailyCheckTime", e.target.value)} style={{ marginLeft: "0.25rem" }} />
        </label>
        <label>
          <input type="checkbox" checked={settings.overdueCheckEnabled} onChange={(e) => update("overdueCheckEnabled", e.target.checked)} />
          納期超過を通知
        </label>
        <label>
          <input type="checkbox" checked={settings.dailyCheckEnabled} onChange={(e) => update("dailyCheckEnabled", e.target.checked)} />
          日次レポート
        </label>
        <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</button>
        <button className="btn btn-sm" onClick={check}>対象を確認</button>
      </div>
      {message && <div style={{ marginTop: "0.5rem" }}>{message}</div>}
      {preview && (
        <div style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
          納期間近 {preview.warningCount} 件・納期超過 {preview.overdueCount} 件 (通知は送っていません)
        </div>
      )}
    </div>
  );
}
