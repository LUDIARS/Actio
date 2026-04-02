import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { pmApi } from "../lib/api";
import type { PMProject } from "../lib/api-types";

const SOURCE_LABELS: Record<string, string> = {
  github: "GitHub Issues",
  notion: "Notion Database",
};

export function PMDashboardPage() {
  useAuth(); // require authentication
  const navigate = useNavigate();
  const [projects, setProjects] = useState<PMProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await pmApi.listProjects();
      setProjects(res.projects);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) return <div className="page-container"><p>読み込み中...</p></div>;
  if (error) return <div className="page-container"><p className="text-error">エラー: {error}</p></div>;

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1>プロジェクト管理</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + プロジェクト作成
        </button>
      </div>

      {showCreate && (
        <CreateProjectForm
          onCreated={() => { setShowCreate(false); fetchProjects(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {projects.length === 0 ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>プロジェクトがありません。外部ソースと接続して始めましょう。</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {projects.map((project) => (
            <div
              key={project.id}
              className="card"
              style={{ padding: "1rem", cursor: "pointer" }}
              onClick={() => navigate(`/pm/${project.id}`)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{project.name}</h3>
                  <span className="badge" style={{ marginTop: "0.25rem" }}>
                    {SOURCE_LABELS[project.source] ?? project.source}
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`「${project.name}」を削除しますか？`)) {
                      await pmApi.deleteProject(project.id);
                      fetchProjects();
                    }
                  }}
                >
                  削除
                </button>
              </div>
              <div style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                <div>同期間隔: {project.syncIntervalMinutes}分</div>
                <div>最終同期: {project.lastSyncedAt ? new Date(project.lastSyncedAt).toLocaleString("ja-JP") : "未同期"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateProjectForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<"github" | "notion">("github");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [syncInterval, setSyncInterval] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const sourceConfig: Record<string, string> = source === "github"
        ? { owner, repo, token }
        : { databaseId, token };

      await pmApi.createProject({ name, source, sourceConfig, syncIntervalMinutes: syncInterval });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: "1.5rem", marginBottom: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>新規プロジェクト</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>プロジェクト名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="form-group">
          <label>データソース</label>
          <select value={source} onChange={(e) => setSource(e.target.value as "github" | "notion")}>
            <option value="github">GitHub Issues</option>
            <option value="notion">Notion Database</option>
          </select>
        </div>

        {source === "github" ? (
          <>
            <div className="form-group">
              <label>Owner (ユーザー/組織)</label>
              <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} required placeholder="例: octocat" />
            </div>
            <div className="form-group">
              <label>Repository</label>
              <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} required placeholder="例: my-project" />
            </div>
          </>
        ) : (
          <div className="form-group">
            <label>Database ID</label>
            <input type="text" value={databaseId} onChange={(e) => setDatabaseId(e.target.value)} required placeholder="Notion Database ID" />
          </div>
        )}

        <div className="form-group">
          <label>APIトークン</label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required placeholder={source === "github" ? "GitHub Personal Access Token" : "Notion Integration Token"} />
        </div>

        <div className="form-group">
          <label>同期間隔 (分)</label>
          <input type="number" value={syncInterval} onChange={(e) => setSyncInterval(Number(e.target.value))} min={1} max={1440} />
        </div>

        {error && <p className="text-error">{error}</p>}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "作成中..." : "作成"}
          </button>
          <button type="button" className="btn" onClick={onCancel}>キャンセル</button>
        </div>
      </form>
    </div>
  );
}
