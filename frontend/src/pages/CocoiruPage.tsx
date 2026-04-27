/**
 * ココイル — オプトイン式の在席シェアリング。
 *
 * 上から:
 *   1. opt-in トグル + 既定設定
 *   2. 現在の broadcast 一覧 (グループメンバー)
 *   3. 自分の broadcast 投稿フォーム (manual / wifi / gps)
 *   4. admin: フロアマップ (SSID → フロア) 編集
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { cocoiruApi } from "../lib/api";
import { wsClient } from "../lib/ws-client";
import type {
  CocoiruReport,
  CocoiruFloorMapEntry,
  CocoiruReportSource,
} from "../lib/api-types";
import { useWsEvent } from "../hooks/useWsEvent";

type Source = CocoiruReportSource;

const SOURCE_LABELS: Record<Source, string> = {
  wifi: "WiFi",
  gps: "GPS",
  manual: "手動",
  schedule: "予定",
};

const SOURCE_COLORS: Record<Source, string> = {
  wifi: "#3FB950",
  gps: "#58A6FF",
  manual: "#D29922",
  schedule: "#A371F7",
};

function formatTimeJa(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelativeJa(future: string): string {
  const now = Date.now();
  const target = new Date(future).getTime();
  const diffMin = Math.round((target - now) / 60000);
  if (diffMin <= 0) return "失効間近";
  if (diffMin < 60) return `あと ${diffMin} 分`;
  return `あと ${Math.floor(diffMin / 60)} 時間`;
}

export function CocoiruPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [optIn, setOptIn] = useState<boolean>(false);
  const [defaultTtlSeconds, setDefaultTtlSeconds] = useState<number>(4 * 60 * 60);
  const [reports, setReports] = useState<CocoiruReport[]>([]);
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  // 投稿フォーム
  const [postSource, setPostSource] = useState<Source>("manual");
  const [postSsid, setPostSsid] = useState<string>("");
  const [postFloor, setPostFloor] = useState<string>("");
  const [postBuilding, setPostBuilding] = useState<string>("");
  const [postComment, setPostComment] = useState<string>("");
  const [postTtlMin, setPostTtlMin] = useState<number>(60);

  // フロアマップ編集 (admin)
  const [editFloorMap, setEditFloorMap] = useState<CocoiruFloorMapEntry[]>([]);

  const showMsg = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(""), 4000);
  };

  // ─── load ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [opt, rep, map] = await Promise.all([
        cocoiruApi.getOptIn(),
        cocoiruApi.listReports(),
        cocoiruApi.listFloorMap(),
      ]);
      setOptIn(opt.optIn);
      setDefaultTtlSeconds(opt.defaultTtlSeconds);
      setReports(rep.reports || []);
      setEditFloorMap(map.entries || []);
    } catch (e) {
      showMsg(`読み込み失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    // WS push が来ない環境 (network glitch / WS 未接続) のため 5 分の保険
    // ポーリングを残す。WS が動いていればここで loadAll しても差分は出ない
    const interval = setInterval(loadAll, 5 * 60_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // 接続後に subscribe_presence を 1 回送る (snapshot は loadAll で既に取得済み)
  useEffect(() => {
    void wsClient
      .sendCommand("cocoiru", "subscribe_presence", {})
      .catch(() => {
        // 未接続 / タイムアウトは無視 (5 分の保険ポーリングが拾う)
      });
  }, []);

  // 他クライアントの broadcast 投稿/撤回をリアルタイムで反映
  useWsEvent("cocoiru.report_changed", (payload) => {
    const evt = payload as unknown as {
      type: "added" | "removed";
      report: Partial<CocoiruReport> & { id: string; userId: string };
    };
    if (evt.type === "removed") {
      setReports((prev) => prev.filter((r) => r.id !== evt.report.id));
      return;
    }
    if (evt.type === "added") {
      const incoming = evt.report as CocoiruReport;
      setReports((prev) => {
        if (prev.some((r) => r.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    }
  });

  // ─── opt-in ───────────────────────────────────────────
  const toggleOptIn = async (next: boolean) => {
    setBusy(true);
    try {
      await cocoiruApi.setOptIn({ optIn: next, defaultTtlSeconds });
      setOptIn(next);
      showMsg(next ? "公開ON にしました" : "公開OFF にしました");
      void loadAll();
    } catch (e) {
      showMsg(`opt-in 更新失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const updateDefaultTtl = async (minutes: number) => {
    const ttl = Math.max(1, Math.min(720, Math.floor(minutes)));
    setDefaultTtlSeconds(ttl * 60);
    try {
      await cocoiruApi.setOptIn({ optIn, defaultTtlSeconds: ttl * 60 });
    } catch (e) {
      showMsg(`既定 TTL 更新失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ─── post broadcast ───────────────────────────────────
  const submitPost = async () => {
    if (!optIn) {
      showMsg("先に公開を ON にしてください");
      return;
    }
    setBusy(true);
    try {
      const body: Parameters<typeof cocoiruApi.postReport>[0] = {
        source: postSource,
        ttlSeconds: postTtlMin * 60,
        comment: postComment.trim() || undefined,
      };
      if (postSource === "wifi") {
        if (!postSsid.trim()) throw new Error("SSID を入力してください");
        body.ssid = postSsid.trim();
      } else if (postSource === "gps") {
        // ブラウザの geolocation で現在地を取得
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("このブラウザは Geolocation 非対応です"));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10_000,
          });
        });
        body.latitude = pos.coords.latitude;
        body.longitude = pos.coords.longitude;
        if (postFloor.trim()) body.floorLabel = postFloor.trim();
        if (postBuilding.trim()) body.buildingLabel = postBuilding.trim();
      } else {
        // manual
        if (!postFloor.trim()) throw new Error("フロアを入力してください");
        body.floorLabel = postFloor.trim();
        if (postBuilding.trim()) body.buildingLabel = postBuilding.trim();
      }
      const res = await cocoiruApi.postReport(body);
      showMsg(`公開しました (${formatRelativeJa(res.expiresAt)} で失効)`);
      setPostComment("");
      void loadAll();
    } catch (e) {
      showMsg(`投稿失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const withdrawReport = async (id: string) => {
    setBusy(true);
    try {
      await cocoiruApi.withdrawReport(id);
      showMsg("撤回しました");
      void loadAll();
    } catch (e) {
      showMsg(`撤回失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // ─── floor-map admin ──────────────────────────────────
  const saveFloorMap = async () => {
    setBusy(true);
    try {
      await cocoiruApi.putFloorMap(
        editFloorMap.map((e, i) => ({
          ssidPattern: e.ssidPattern,
          floorLabel: e.floorLabel,
          buildingLabel: e.buildingLabel ?? undefined,
          sortOrder: e.sortOrder ?? i,
        })),
      );
      showMsg("フロアマップを更新しました");
      void loadAll();
    } catch (e) {
      showMsg(`フロアマップ保存失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const updateFloorMapRow = (
    idx: number,
    patch: Partial<CocoiruFloorMapEntry>,
  ) => {
    setEditFloorMap((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  };

  const addFloorMapRow = () => {
    setEditFloorMap((rows) => [
      ...rows,
      {
        id: `new-${Date.now()}`,
        ssidPattern: "",
        floorLabel: "",
        buildingLabel: null,
        sortOrder: rows.length,
      },
    ]);
  };

  const removeFloorMapRow = (idx: number) => {
    setEditFloorMap((rows) => rows.filter((_, i) => i !== idx));
  };

  // ─── render ───────────────────────────────────────────
  const sortedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      ),
    [reports],
  );

  return (
    <div style={{ padding: "1.5rem", maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>ココイル</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        「いまここにいる」をオプトインで共有します。発信したい時だけ公開し、TTL
        で自動的に消えます。
      </p>

      {message && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            background: "var(--surface-2, #1f2428)",
            borderRadius: 6,
            marginBottom: "1rem",
            color: "var(--text)",
          }}
        >
          {message}
        </div>
      )}

      {/* opt-in */}
      <section
        style={{
          padding: "1rem",
          background: "var(--surface-1, #161b22)",
          borderRadius: 8,
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={optIn}
              onChange={(e) => toggleOptIn(e.target.checked)}
              disabled={busy}
              style={{ marginRight: "0.5rem", transform: "scale(1.3)" }}
            />
            公開する (opt-in)
          </label>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            グループメンバーに自分の在席状態を見せます。OFF にすると現在の公開は
            すべて即時撤回されます。
          </span>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span>既定 TTL:</span>
          <input
            type="number"
            min={1}
            max={720}
            value={Math.round(defaultTtlSeconds / 60)}
            onChange={(e) => updateDefaultTtl(parseInt(e.target.value, 10) || 60)}
            disabled={!optIn || busy}
            style={{ width: 80 }}
          />
          <span>分 (1〜720)</span>
        </div>
      </section>

      {/* reports list */}
      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
          現在公開中 ({sortedReports.length})
        </h2>
        {sortedReports.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>誰もいません</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sortedReports.map((r) => (
              <li
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6rem 0.8rem",
                  background: "var(--surface-1, #161b22)",
                  borderRadius: 6,
                  marginBottom: "0.4rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span
                    title={SOURCE_LABELS[r.source]}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: SOURCE_COLORS[r.source],
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>
                    {r.buildingLabel ? `${r.buildingLabel} ` : ""}
                    {r.floorLabel ?? "(不明)"}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                    {r.userName ?? `user-${r.userId.slice(0, 8)}`}
                  </span>
                  {r.comment && (
                    <span style={{ color: "var(--text)", fontSize: "0.9rem" }}>
                      — {r.comment}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {formatTimeJa(r.startedAt)}〜 / {formatRelativeJa(r.expiresAt)}
                  </span>
                  {user?.id === r.userId && (
                    <button
                      onClick={() => withdrawReport(r.id)}
                      disabled={busy}
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}
                    >
                      撤回
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* post form */}
      <section
        style={{
          padding: "1rem",
          background: "var(--surface-1, #161b22)",
          borderRadius: 8,
          marginBottom: "1.5rem",
          opacity: optIn ? 1 : 0.5,
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.6rem" }}>公開する</h2>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          {(["manual", "wifi", "gps"] as Source[]).map((s) => (
            <button
              key={s}
              onClick={() => setPostSource(s)}
              disabled={!optIn || busy}
              style={{
                padding: "0.3rem 0.7rem",
                background: postSource === s ? "var(--accent, #2f81f7)" : "transparent",
                color: postSource === s ? "white" : "var(--text)",
                border: "1px solid var(--border, #30363d)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>

        {postSource === "wifi" && (
          <div style={{ marginBottom: "0.5rem" }}>
            <label style={{ display: "block", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              SSID (現在接続中の WiFi 名)
            </label>
            <input
              type="text"
              value={postSsid}
              onChange={(e) => setPostSsid(e.target.value)}
              placeholder="例: BANTAN_3F"
              disabled={!optIn || busy}
              style={{ width: "100%", padding: "0.4rem" }}
            />
          </div>
        )}

        {(postSource === "manual" || postSource === "gps") && (
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={postBuilding}
              onChange={(e) => setPostBuilding(e.target.value)}
              placeholder="建物 (例: 本館)"
              disabled={!optIn || busy}
              style={{ flex: 1, padding: "0.4rem", minWidth: 120 }}
            />
            <input
              type="text"
              value={postFloor}
              onChange={(e) => setPostFloor(e.target.value)}
              placeholder={postSource === "manual" ? "フロア (例: 3F)" : "フロア (任意)"}
              disabled={!optIn || busy}
              style={{ flex: 1, padding: "0.4rem", minWidth: 120 }}
            />
          </div>
        )}

        <div style={{ marginBottom: "0.5rem" }}>
          <input
            type="text"
            value={postComment}
            onChange={(e) => setPostComment(e.target.value)}
            placeholder="ひとことコメント (任意、280 文字以内)"
            maxLength={280}
            disabled={!optIn || busy}
            style={{ width: "100%", padding: "0.4rem" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span>TTL:</span>
          <input
            type="number"
            min={1}
            max={720}
            value={postTtlMin}
            onChange={(e) => setPostTtlMin(parseInt(e.target.value, 10) || 60)}
            disabled={!optIn || busy}
            style={{ width: 80 }}
          />
          <span>分</span>
          <button
            onClick={submitPost}
            disabled={!optIn || busy}
            style={{ marginLeft: "auto", padding: "0.4rem 1.2rem" }}
          >
            公開する
          </button>
        </div>
      </section>

      {/* admin: floor map */}
      {isAdmin && (
        <section
          style={{
            padding: "1rem",
            background: "var(--surface-1, #161b22)",
            borderRadius: 8,
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.6rem" }}>
            フロアマップ (admin)
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.6rem" }}>
            WiFi SSID とフロアの対応表。`*` で glob マッチ可 (例: `BANTAN_*F`)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0.5rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border, #30363d)" }}>
                <th style={{ padding: "0.3rem" }}>SSID パターン</th>
                <th style={{ padding: "0.3rem" }}>フロア</th>
                <th style={{ padding: "0.3rem" }}>建物</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {editFloorMap.map((row, idx) => (
                <tr key={row.id}>
                  <td style={{ padding: "0.2rem" }}>
                    <input
                      type="text"
                      value={row.ssidPattern}
                      onChange={(e) =>
                        updateFloorMapRow(idx, { ssidPattern: e.target.value })
                      }
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.2rem" }}>
                    <input
                      type="text"
                      value={row.floorLabel}
                      onChange={(e) =>
                        updateFloorMapRow(idx, { floorLabel: e.target.value })
                      }
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.2rem" }}>
                    <input
                      type="text"
                      value={row.buildingLabel ?? ""}
                      onChange={(e) =>
                        updateFloorMapRow(idx, {
                          buildingLabel: e.target.value || null,
                        })
                      }
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.2rem", textAlign: "right" }}>
                    <button onClick={() => removeFloorMapRow(idx)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={addFloorMapRow}>+ 行を追加</button>
            <button
              onClick={saveFloorMap}
              disabled={busy}
              style={{ marginLeft: "auto" }}
            >
              フロアマップを保存
            </button>
          </div>
        </section>
      )}

      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        プライバシー: 個人特定情報は Cernere 集約。本モジュール DB には Cernere
        user_id のみ保持します。opt-out / 撤回は即時反映、TTL 切れは自動削除。
      </p>
    </div>
  );
}
