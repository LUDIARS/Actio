import { useEffect, useState } from "react";
import { userPrefsApi } from "../lib/api";

/**
 * 通知種別の設定 (push 配信の有無に関わる toggle 群)。
 *
 * 現状 1 項目のみ:
 * - notify.task.self_completion (default ON) — 自分で完了させた自タスクへの
 *   完了 push 通知。 OFF にするとリマインダーやアサイン通知のみ届く。
 */

const KEY_SELF_COMPLETION = "notify.task.self_completion";

export function NotificationPrefsSettings() {
  const [loading, setLoading] = useState(true);
  const [selfCompletion, setSelfCompletion] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await userPrefsApi.list();
        if (cancelled) return;
        const v = r.preferences[KEY_SELF_COMPLETION];
        // 未設定 = デフォルト ON、 "false" のときのみ OFF
        setSelfCompletion(v !== "false");
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const prev = selfCompletion;
    setSelfCompletion(next);
    try {
      await userPrefsApi.update({
        [KEY_SELF_COMPLETION]: next ? "true" : "false",
      });
      setMsg("保存しました");
    } catch (e) {
      setSelfCompletion(prev);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>通知種別</h2>
      <p style={hintStyle}>
        どの状態変化で push 通知を受け取るかを切り替えます。 channel (端末)
        ごとの ON/OFF は<strong>「通知 (WebPush)」</strong>セクションで管理します。
      </p>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0",
          cursor: loading || busy ? "not-allowed" : "pointer",
          opacity: loading ? 0.5 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={selfCompletion}
          disabled={loading || busy}
          onChange={(e) => toggle(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>
            自分で完了したタスクの完了通知を受け取る
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            OFF にすると、 自分以外がアサイン済みタスクを完了させたとき (owner として)
            のみ通知が届きます。
          </div>
        </div>
      </label>

      {msg && <p style={{ color: "var(--accent, #2a6df4)", fontSize: "0.8rem" }}>{msg}</p>}
      {err && <p style={errStyle}>{err}</p>}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1.5rem",
  marginTop: "1.5rem",
};

const titleStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 600,
  marginBottom: "1rem",
  paddingBottom: "0.5rem",
  borderBottom: "1px solid var(--border)",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--text-muted)",
  marginBottom: "1rem",
};

const errStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "#b00",
  marginTop: "0.5rem",
};
