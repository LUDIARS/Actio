import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { adminApi, auth } from "../lib/api";

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
  lastLoginAt: string | null;
  groups: GroupInfo[];
}

export function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const isAdmin = user?.role === "admin";

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      if (isAdmin) {
        const data = await adminApi.listUsers();
        // Admin API returns users without groups, add empty groups array
        setUsers(data.users.map((u) => ({ ...u, groups: [] as GroupInfo[] })));
      } else {
        const data = await adminApi.listUsersByGroup();
        setUsers(data.users);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

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

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError("新しいパスワードは8文字以上で入力してください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("新しいパスワードが一致しません");
      return;
    }

    setChangingPassword(true);
    try {
      await auth.changePassword({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPasswordSuccess("パスワードを変更しました");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setChangingPassword(false);
    }
  };

  function formatLastLogin(lastLoginAt: string | null): string {
    if (!lastLoginAt) return "未ログイン";
    const d = new Date(lastLoginAt);
    if (isNaN(d.getTime())) return "未ログイン";
    return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // 全グループ一覧を抽出
  const allGroups = Array.from(
    new Map(
      users.flatMap((u) => u.groups || []).map((g) => [g.id, g])
    ).values()
  );

  // フィルタリング
  const filteredUsers = users.filter((u) => {
    const matchesGroup =
      filterGroup === "all" || (u.groups || []).some((g) => g.id === filterGroup);
    const matchesSearch =
      !searchText ||
      u.name.toLowerCase().includes(searchText.toLowerCase()) ||
      u.email.toLowerCase().includes(searchText.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900 }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>ユーザー管理</h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        {isAdmin
          ? "全ユーザーを表示しています。ロールの変更も可能です。"
          : "同じグループに所属するユーザーを表示しています。"}
      </p>

      {/* パスワード変更セクション */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={() => { setShowPasswordForm(!showPasswordForm); setPasswordError(null); setPasswordSuccess(null); }}
          style={{
            padding: "0.4rem 1rem",
            fontSize: "0.85rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          {showPasswordForm ? "キャンセル" : "パスワードを変更"}
        </button>
        {passwordSuccess && (
          <span style={{ marginLeft: "1rem", fontSize: "0.85rem", color: "var(--text-success, #080)" }}>
            {passwordSuccess}
          </span>
        )}
        {showPasswordForm && (
          <div style={{ marginTop: "0.75rem", padding: "1rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxWidth: 400 }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--text-muted)" }}>現在のパスワード</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Google認証のみの場合は空欄でOK"
                style={{ width: "100%", padding: "0.4rem 0.5rem", fontSize: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text)", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--text-muted)" }}>新しいパスワード (8文字以上)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: "100%", padding: "0.4rem 0.5rem", fontSize: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text)", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "var(--text-muted)" }}>新しいパスワード (確認)</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ width: "100%", padding: "0.4rem 0.5rem", fontSize: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text)", boxSizing: "border-box" }}
              />
            </div>
            {passwordError && (
              <div style={{ fontSize: "0.8rem", color: "var(--text-error, #c00)", marginBottom: "0.5rem" }}>{passwordError}</div>
            )}
            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              style={{
                padding: "0.4rem 1rem",
                fontSize: "0.85rem",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "var(--accent, #0066cc)",
                color: "#fff",
                cursor: changingPassword ? "not-allowed" : "pointer",
                opacity: changingPassword ? 0.6 : 1,
              }}
            >
              {changingPassword ? "変更中..." : "変更する"}
            </button>
          </div>
        )}
      </div>

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
              {isAdmin && <th style={{ padding: "0.5rem" }}>最終ログイン</th>}
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
                  {(u.groups || []).length === 0 ? (
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
                  <td style={{ padding: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {formatLastLogin(u.lastLoginAt)}
                  </td>
                )}
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
