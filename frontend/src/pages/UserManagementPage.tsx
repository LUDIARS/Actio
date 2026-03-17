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

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await adminApi.listUsers();
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

  if (user?.role !== "admin") {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>アクセス拒否</h1>
        <p style={{ color: "var(--text-muted)" }}>
          このページは管理者のみアクセスできます。
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 800 }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>ユーザー管理</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        ユーザーのロールを変更できます。管理者はグループリーダーや他の管理者を任命できます。
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

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>読み込み中...</p>
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
              <th style={{ padding: "0.5rem" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={{ padding: "0.5rem" }}>{u.name}</td>
                <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
                  {u.email}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {ROLE_LABELS[u.role] || u.role}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {u.id === user?.id ? (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      (自分)
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
