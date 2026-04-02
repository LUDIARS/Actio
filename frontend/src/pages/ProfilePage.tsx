import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { profileApi, groupApi } from "../lib/api";
import type { ProjectRole } from "../lib/api-types";

interface GroupInfo {
  id: string;
  name: string;
  role: string;
}

export function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Profile
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Groups & Project Roles
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editRoles, setEditRoles] = useState("");
  const [savingRoles, setSavingRoles] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const [profileRes, groupsRes] = await Promise.all([
        profileApi.getMyProfile(),
        groupApi.listMyGroups(),
      ]);
      setBio(profileRes.profile.bio);
      setDisplayName(profileRes.profile.displayName ?? "");
      setProjectRoles(profileRes.projectRoles);
      setGroups(groupsRes.groups ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await profileApi.updateMyProfile({
        bio,
        displayName: displayName.trim() || null,
      });
      setSuccessMsg("プロフィールを保存しました");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const startEditRoles = (groupId: string) => {
    const currentRoles = projectRoles
      .filter((r) => r.groupId === groupId)
      .map((r) => r.roleName);
    setEditingGroupId(groupId);
    setEditRoles(currentRoles.join(", "));
  };

  const handleSaveRoles = async () => {
    if (!editingGroupId) return;
    setSavingRoles(true);
    setError(null);
    try {
      const roleNames = editRoles
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      const res = await profileApi.updateMyRoles(editingGroupId, roleNames);
      // Update local state
      setProjectRoles((prev) => [
        ...prev.filter((r) => r.groupId !== editingGroupId),
        ...res.roles,
      ]);
      setEditingGroupId(null);
      setEditRoles("");
      setSuccessMsg("プロジェクトロールを保存しました");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingRoles(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <p style={{ color: "var(--text-muted)" }}>読み込み中...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "1.5rem" }}>マイプロフィール</h1>

      {error && (
        <div style={{
          padding: "0.75rem",
          marginBottom: "1rem",
          background: "var(--red-bg, #2a1515)",
          border: "1px solid var(--red, #e53e3e)",
          borderRadius: "var(--radius-sm)",
          color: "var(--red, #e53e3e)",
          fontSize: "0.85rem",
        }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{
          padding: "0.75rem",
          marginBottom: "1rem",
          background: "var(--green-bg, #152a15)",
          border: "1px solid var(--green, #38a169)",
          borderRadius: "var(--radius-sm)",
          color: "var(--green, #38a169)",
          fontSize: "0.85rem",
        }}>
          {successMsg}
        </div>
      )}

      {/* Basic Info (read-only) */}
      <section style={{
        marginBottom: "1.5rem",
        padding: "1rem",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>基本情報</h2>
        <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.85rem" }}>
          <div>
            <span style={{ color: "var(--text-muted)" }}>名前: </span>
            <span>{user?.name}</span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>メール: </span>
            <span>{user?.email}</span>
          </div>
        </div>
      </section>

      {/* Editable Profile */}
      <section style={{
        marginBottom: "1.5rem",
        padding: "1rem",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>プロフィール</h2>

        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            表示名
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user?.name ?? "表示名を入力"}
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              fontSize: "0.85rem",
            }}
          />
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            自己紹介
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="自己紹介を書いてください..."
            rows={5}
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              fontSize: "0.85rem",
              resize: "vertical",
            }}
          />
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          style={{
            padding: "0.5rem 1.25rem",
            background: "var(--accent)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: "#000",
            fontSize: "0.85rem",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "保存中..." : "プロフィールを保存"}
        </button>
      </section>

      {/* Project Roles */}
      <section style={{
        padding: "1rem",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>プロジェクト別ロール</h2>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          所属グループ（プロジェクト）ごとに、仕事上の役割を設定できます。
        </p>

        {groups.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            グループに所属していません。
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {groups.map((group) => {
              const roles = projectRoles.filter((r) => r.groupId === group.id);
              const isEditing = editingGroupId === group.id;

              return (
                <div
                  key={group.id}
                  style={{
                    padding: "0.75rem",
                    background: "var(--bg-surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{group.name}</span>
                    {!isEditing && (
                      <button
                        onClick={() => startEditRoles(group.id)}
                        style={{
                          padding: "0.25rem 0.75rem",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        編集
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={editRoles}
                        onChange={(e) => setEditRoles(e.target.value)}
                        placeholder="ロールをカンマ区切りで入力 (例: デザイナー, PM)"
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text)",
                          fontSize: "0.85rem",
                          marginBottom: "0.5rem",
                        }}
                      />
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          onClick={handleSaveRoles}
                          disabled={savingRoles}
                          style={{
                            padding: "0.3rem 0.75rem",
                            background: "var(--accent)",
                            border: "none",
                            borderRadius: "var(--radius-sm)",
                            color: "#000",
                            fontSize: "0.8rem",
                            cursor: savingRoles ? "not-allowed" : "pointer",
                          }}
                        >
                          {savingRoles ? "保存中..." : "保存"}
                        </button>
                        <button
                          onClick={() => { setEditingGroupId(null); setEditRoles(""); }}
                          style={{
                            padding: "0.3rem 0.75rem",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            color: "var(--text-muted)",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.85rem" }}>
                      {roles.length > 0 ? (
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {roles.map((r) => (
                            <span
                              key={r.id}
                              style={{
                                padding: "0.15rem 0.5rem",
                                background: "var(--accent-bg, rgba(99, 102, 241, 0.15))",
                                border: "1px solid var(--accent)",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "0.8rem",
                                color: "var(--accent)",
                              }}
                            >
                              {r.roleName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                          ロール未設定
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
