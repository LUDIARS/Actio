import { Link } from "react-router-dom";

const MODULES = [
  {
    id: "M1",
    name: "授業予定組立ツール",
    desc: "講師・カリキュラム・教室CSVを取り込み、DPで時間割を自動生成。コマ入れ替えでは候補ハイライト付き。",
    path: "/schedule",
    color: "var(--accent)",
  },
  {
    id: "M2",
    name: "データ統合",
    desc: "M1授業予定・Googleカレンダー・個人予定を統合スロットに正規化。プライバシールール適用。",
    path: "#",
    color: "var(--text-muted)",
  },
  {
    id: "M3",
    name: "オートスケジューラ",
    desc: "グループメンバーの空きコマ・空き教室を自動計算。ヒートマップ + ランキングで最適MTGスロットを提案。",
    path: "/scheduler",
    color: "var(--green)",
  },
  {
    id: "M4",
    name: "予約システム",
    desc: "空きコマに予約を登録。楽観的ロックで競合制御。全ユーザーに公開共有。",
    path: "/reservations",
    color: "var(--orange)",
  },
  {
    id: "M5",
    name: "Webhook・リマインド通知",
    desc: "予定変更Webhook配信、リマインド通知、通知チャンネル設定。HMAC-SHA256署名 + 指数バックオフリトライ。",
    path: "/notifications",
    color: "var(--purple)",
  },
];

export function Dashboard() {
  return (
    <div>
      <div className="page-header">
        <h1>Schedula</h1>
        <p>授業スケジューリング + グループ予約統合プラットフォーム</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "1rem",
        }}
      >
        {MODULES.map((m) => (
          <Link
            key={m.id}
            to={m.path}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              className="card"
              style={{
                borderLeft: `3px solid ${m.color}`,
                transition: "transform 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "translateY(-2px)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "none")
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: m.color,
                    border: `1px solid ${m.color}`,
                    borderRadius: 4,
                    padding: "0.1rem 0.4rem",
                  }}
                >
                  {m.id}
                </span>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                  {m.name}
                </h3>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {m.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
          データフロー
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.8rem",
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "M1 授業組立", color: "var(--accent)" },
            { label: "M2 データ統合", color: "var(--text-muted)" },
            { label: "M3 空き計算", color: "var(--green)" },
            { label: "M4 予約登録", color: "var(--orange)" },
            { label: "M5 通知配信", color: "var(--purple)" },
          ].map((item, i) => (
            <span key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  background: item.color,
                  color: "#000",
                  padding: "0.2rem 0.6rem",
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: "0.75rem",
                }}
              >
                {item.label}
              </span>
              {i < 4 && (
                <span style={{ color: "var(--text-muted)" }}>→</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
