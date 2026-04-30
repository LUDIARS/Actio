import { useEffect, useState, useCallback } from "react";
import { pushApi, type PushSubscriptionRow } from "../lib/api";

/**
 * WebPush 設定 (PWA push 通知の有効化 + 端末管理)。
 *
 * iOS Safari は PWA を「ホーム画面に追加」 した状態でないと
 * `PushManager.subscribe` が許可されない (16.4+ の仕様)。 ボタン押下後の
 * 失敗 reason を文字列で見せる。
 *
 * Nuntius が backend で未構成 (NUNTIUS_URL や Cernere project credentials が
 * 無い) なら 503 が返るので、 UI は「未構成」 と案内するだけで操作は無効化。
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSettings() {
  const [supported, setSupported] = useState(true);
  const [vapidStatus, setVapidStatus] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [vapidKey, setVapidKey] = useState("");
  const [subs, setSubs] = useState<PushSubscriptionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await pushApi.list();
      setSubs(r.items || []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      setVapidStatus("error");
      return;
    }
    pushApi
      .vapidPublicKey()
      .then((r) => {
        if (!r.publicKey) {
          setVapidStatus("missing");
        } else {
          setVapidKey(r.publicKey);
          setVapidStatus("ok");
        }
      })
      .catch(() => setVapidStatus("missing"));

    // SW を register しておく (subscribe 前でも push 受信可能にするため)
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});

    refresh();
  }, [refresh]);

  const subscribe = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (vapidStatus !== "ok") throw new Error("VAPID 未構成");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error(`通知許可が拒否されました (${perm})`);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // TS 5.7+ の Uint8Array<ArrayBufferLike> 厳格化対策で BufferSource に cast
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
        });
      }
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("subscription が空です");
      }
      await pushApi.subscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        label: navigator.userAgent.slice(0, 60),
      });
      setMsg("通知を有効化しました");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      await pushApi.remove(id);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div style={cardStyle}>
        <h2 style={titleStyle}>通知 (WebPush)</h2>
        <p style={hintStyle}>この端末は WebPush 非対応です (iOS なら 16.4+ + ホーム画面追加)。</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>通知 (WebPush)</h2>
      <p style={hintStyle}>
        この端末で push 通知を受け取れるようにします。<br />
        <strong>iOS は「ホーム画面に追加」 して PWA として開いた状態</strong>でないと許可ダイアログが出ません (16.4+)。
      </p>
      {vapidStatus === "missing" && (
        <p style={errStyle}>サーバ側 VAPID が未構成です (Nuntius の `VAPID_PUBLIC_KEY` を設定してください)</p>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          onClick={subscribe}
          disabled={busy || vapidStatus !== "ok"}
          style={{ ...btnPrimary, opacity: busy || vapidStatus !== "ok" ? 0.5 : 1 }}
        >
          {busy ? "処理中…" : "この端末で通知を有効化"}
        </button>
      </div>
      {msg && <p style={{ color: "var(--accent, #2a6df4)", marginTop: "0.5rem" }}>{msg}</p>}
      {err && <p style={errStyle}>{err}</p>}

      <h3 style={{ ...titleStyle, fontSize: "0.85rem", marginTop: "1.5rem" }}>登録済の端末</h3>
      {subs.length === 0 ? (
        <p style={hintStyle}>まだ端末が登録されていません</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {subs.map((s) => (
            <li
              key={s.id}
              style={{
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "0.8rem" }}>
                {s.revokedAt ? "🚫 失効" : "🟢 有効"} ·{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  {(s.label || s.userAgent || "(unknown)").slice(0, 60)}
                </span>
              </span>
              <button onClick={() => remove(s.id)} disabled={busy} style={btnGhost}>
                解除
              </button>
            </li>
          ))}
        </ul>
      )}
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

const btnPrimary: React.CSSProperties = {
  background: "var(--accent, #2a6df4)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "0.5rem 1rem",
  cursor: "pointer",
  fontSize: "0.85rem",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "0.25rem 0.6rem",
  cursor: "pointer",
  fontSize: "0.75rem",
};
