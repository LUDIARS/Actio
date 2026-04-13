import { useState } from "react";
import { TimetableGrid, type GridSlot } from "../components/TimetableGrid";
import { useNavigate } from "react-router-dom";
import { DAY_LABELS, DAYS_COUNT, PERIODS_COUNT } from "../lib/constants";
import { m3 } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Suggestion {
  day: number;
  period: number;
  score: number;
  availableCount: number;
  totalMembers: number;
  availableRooms: string[];
  reasons: string[];
}

interface AvailabilitySlot {
  day: number;
  period: number;
  availableCount: number;
  totalMembers: number;
  isFullyAvailable: boolean;
  isPartiallyAvailable: boolean;
  availableRooms: string[];
}

export function SchedulerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [totalMembers, setTotalMembers] = useState(0);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Create group form
  const [newGroupName, setNewGroupName] = useState("");
  const [newMembers, setNewMembers] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const members = newMembers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const result = await m3.createGroup({
        name: newGroupName,
        members,
        createdBy: user?.id || "",
      });
      setGroupId(result.id);
      setGroupName(result.name);
      setShowCreate(false);
      showMsg(`Group created: ${result.name}`);
    } catch (e) {
      console.error("[SchedulerPage] handleCreateGroup失敗:", e);
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleLoadGroup = async () => {
    if (!groupId.trim()) return;
    setLoading(true);
    try {
      const group = await m3.getGroup(groupId);
      setGroupName(group.name);

      const [avail, sugg] = await Promise.all([
        m3.getAvailability(groupId),
        m3.getSuggestions(groupId),
      ]);

      setTotalMembers(avail.totalMembers);
      setAvailability(avail.availability || []);
      setSuggestions(sugg.suggestions || []);
    } catch (e) {
      console.error("[SchedulerPage] handleLoadGroup失敗:", e);
      showMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  // Heatmap: availability ratio → color intensity
  const getHeatColor = (count: number, total: number): string => {
    if (total === 0) return "var(--slot-free)";
    const ratio = count / total;
    if (ratio === 1) return "rgba(63, 185, 80, 0.4)";
    if (ratio >= 0.7) return "rgba(63, 185, 80, 0.2)";
    if (ratio > 0) return "rgba(210, 153, 34, 0.15)";
    return "var(--bg-surface)";
  };

  const buildSlots = (): GridSlot[][] => {
    const grid: GridSlot[][] = Array.from({ length: DAYS_COUNT }, () =>
      Array.from({ length: PERIODS_COUNT }, () => ({
        label: "",
        status: "free" as const,
      }))
    );

    for (const slot of availability) {
      const label =
        slot.availableCount === slot.totalMembers
          ? `${slot.availableCount}/${slot.totalMembers}`
          : slot.availableCount > 0
            ? `${slot.availableCount}/${slot.totalMembers}`
            : "";

      grid[slot.day][slot.period] = {
        label,
        color: getHeatColor(slot.availableCount, slot.totalMembers),
      };
    }

    return grid;
  };

  const handleBookFromSuggestion = (s: Suggestion) => {
    const params = new URLSearchParams({
      day: String(s.day),
      period: String(s.period),
      groupId,
      roomId: s.availableRooms[0] || "",
    });
    navigate(`/reservations/new?${params}`);
  };

  return (
    <div>
      <div className="page-header">
        <h1>M3 オートスケジューラ</h1>
        <p>
          グループの空きコマを自動計算し、最適なMTGスロットを提案
        </p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: message.startsWith("Error")
              ? "var(--red)"
              : "var(--green)",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      {/* Group controls */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>グループID</label>
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="グループIDを入力..."
            />
          </div>
          <button className="primary" onClick={handleLoadGroup} disabled={loading}>
            {loading ? "読込中..." : "空き計算"}
          </button>
          <button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "閉じる" : "新規グループ"}
          </button>
        </div>

        {showCreate && (
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div className="form-group">
              <label>グループ名</label>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="例: チームA"
              />
            </div>
            <div className="form-group">
              <label>メンバーID（カンマ区切り）</label>
              <input
                value={newMembers}
                onChange={(e) => setNewMembers(e.target.value)}
                placeholder="user-1, user-2, user-3"
              />
            </div>
            <button className="primary" onClick={handleCreateGroup}>
              作成
            </button>
          </div>
        )}
      </div>

      {groupName && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            fontSize: "0.8rem",
          }}
        >
          <span className="badge blue">{groupName}</span>
          <span className="badge green">{totalMembers} members</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        {/* Heatmap grid */}
        <div style={{ flex: "2 1 500px" }}>
          <h3
            style={{
              fontSize: "0.85rem",
              marginBottom: "0.5rem",
              color: "var(--text-muted)",
            }}
          >
            空きコマヒートマップ
          </h3>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "0.5rem",
              fontSize: "0.7rem",
              color: "var(--text-muted)",
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "rgba(63, 185, 80, 0.4)",
                  borderRadius: 2,
                  marginRight: 4,
                }}
              />
              全員空き
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "rgba(63, 185, 80, 0.2)",
                  borderRadius: 2,
                  marginRight: 4,
                }}
              />
              70%+空き
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "rgba(210, 153, 34, 0.15)",
                  borderRadius: 2,
                  marginRight: 4,
                }}
              />
              一部空き
            </span>
          </div>

          <TimetableGrid slots={buildSlots()} />
        </div>

        {/* Suggestions */}
        <div style={{ flex: "1 1 280px" }}>
          <h3
            style={{
              fontSize: "0.85rem",
              marginBottom: "0.5rem",
              color: "var(--text-muted)",
            }}
          >
            MTG候補ランキング
          </h3>
          {suggestions.length === 0 ? (
            <div className="empty-state">
              <p>グループを読み込むと候補が表示されます</p>
            </div>
          ) : (
            <div className="flex-col">
              {suggestions.slice(0, 10).map((s, i) => (
                <div
                  key={`${s.day}-${s.period}`}
                  className="card"
                  style={{ padding: "0.75rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.4rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      #{i + 1} {DAY_LABELS[s.day]} {s.period + 1}限
                    </span>
                    <span className="badge green">Score: {s.score}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    参加: {s.availableCount}/{s.totalMembers} | 空き教室:{" "}
                    {s.availableRooms.length}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.3rem",
                      flexWrap: "wrap",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {s.reasons.map((r) => (
                      <span
                        key={r}
                        style={{
                          fontSize: "0.65rem",
                          background: "var(--bg-surface-2)",
                          padding: "0.1rem 0.4rem",
                          borderRadius: 3,
                        }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  <button
                    className="primary"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
                    onClick={() => handleBookFromSuggestion(s)}
                  >
                    予約へ →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
