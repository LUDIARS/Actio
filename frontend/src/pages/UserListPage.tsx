import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { adminApi } from "../lib/api";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  group_leader: "グループリーダー",
  general: "一般",
};

const ROLE_OPTIONS = [
  { value: "admin", label: "管理者" },
  { value: "group_leader", label: "グループリーダー" },
  { value: "general", label: "一般" },
];

interface GroupInfo {
  id: string;
  name: string;
  role: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  major: string | null;
  createdAt: string;
  groups: GroupInfo[];
}

export function UserListPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const isAdmin = user?.role === "admin";

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await adminApi.listUsersByGroup();
      setUsers(data.users);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdating(userId);
    try {
      await adminApi.updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      alert(`ロール変更に失敗しました: ${(err as Error).message}`);
    } finally {
      setUpdating(null);
    }
  };

  // 全グループ一覧を抽出
  const allGroups = Array.from(
    new Map(
      users.flatMap((u) => u.groups).map((g) => [g.id, g])
    ).values()
  );

  // フィルタリング
  const filteredUsers = users.filter((u) => {
    const matchesGroup =
      filterGroup === "all" || u.groups.some((g) => g.id === filterGroup);
    const matchesSearch =
      !searchText ||
      u.name.toLowerCase().includes(searchText.toLowerCase()) ||
      u.email.toLowerCase().includes(searchText.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900 }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>ユーザー一覧</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        {isAdmin
          ? "全ユーザーを表示しています。ロールの変更も可能です。"
          : "同じグループに所属するユーザーを表示しています。"}
      </p>

      {error && (
        <div
          style={{
            padding: "0.75rem",
            background: "var(--bg-error, #fee)",
            border: "1px solid var(--border-error, #fcc)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1rem",
            fontSize: "0.85rem",
            color: "var(--text-error, #c00)",
          }}
        >
          {error}
        </div>
      )}

      {/* フィルター */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="名前・メールで検索..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            padding: "0.4rem 0.75rem",
            fontSize: "0.85rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            color: "var(--text)",
            minWidth: 200,
          }}
        />
        {allGroups.length > 0 && (
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            style={{
              padding: "0.4rem 0.75rem",
              fontSize: "0.85rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text)",
            }}
          >
            <option value="all">全グループ</option>
            {allGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {filteredUsers.length}件
        </span>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>読み込み中...</p>
      ) : filteredUsers.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          該当するユーザーが見つかりません。
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "2px solid var(--border)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "0.5rem" }}>名前</th>
              <th style={{ padding: "0.5rem" }}>メール</th>
              <th style={{ padding: "0.5rem" }}>ロール</th>
              <th style={{ padding: "0.5rem" }}>グループ</th>
              {isAdmin && <th style={{ padding: "0.5rem" }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr
                key={u.id}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={{ padding: "0.5rem" }}>
                  {u.name}
                  {u.id === user?.id && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.7rem",
                        color: "var(--accent)",
                      }}
                    >
                      (自分)
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
                  {u.email}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {ROLE_LABELS[u.role] || u.role}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {u.groups.length === 0 ? (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      未所属
                    </span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {u.groups.map((g) => (
                        <span
                          key={g.id}
                          style={{
                            display: "inline-block",
                            padding: "0.15rem 0.5rem",
                            fontSize: "0.75rem",
                            background: "var(--bg-surface-2)",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                {isAdmin && (
                  <td style={{ padding: "0.5rem" }}>
                    {u.id === user?.id ? (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        -
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={updating === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.8rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          background: "var(--bg-surface)",
                          color: "var(--text)",
                        }}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
