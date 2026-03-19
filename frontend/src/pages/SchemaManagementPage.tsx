import { useState, useEffect, useCallback } from "react";
import { m1Schema } from "../lib/api";
import { DAY_LABELS, PERIODS_COUNT, getPeriodLabel } from "../lib/constants";

// ─── Types ──────────────────────────────────────────────────

interface Department {
  id: string;
  name: string;
  createdAt: string;
}

interface Instructor {
  id: string;
  name: string;
  createdAt: string;
}

interface Curriculum {
  id: string;
  name: string;
  departmentId: string;
  periods: number;
  instructorId: string | null;
  termId: string | null;
  departmentIds?: string[];
  createdAt: string;
}

interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface AvailableSlot {
  id: string;
  instructorId: string;
  day: number;
  periods: number[];
}

type ActiveTab = "departments" | "instructors" | "curricula" | "terms" | "availability";

// ─── Component ──────────────────────────────────────────────

export function SchemaManagementPage() {
  const [tab, setTab] = useState<ActiveTab>("departments");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const showMessage = (msg: string, type: "success" | "error" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 4000);
  };

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "departments", label: "学科" },
    { key: "instructors", label: "講師" },
    { key: "terms", label: "ターム" },
    { key: "curricula", label: "カリキュラム" },
    { key: "availability", label: "出講可能スロット" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>M1 スキーマ管理</h1>
        <p>学科・講師・カリキュラム・出講可能スロットをデータベースから直接管理します</p>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: messageType === "error" ? "var(--red)" : "var(--green)",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.key ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "departments" && <DepartmentsTab showMessage={showMessage} />}
      {tab === "instructors" && <InstructorsTab showMessage={showMessage} />}
      {tab === "terms" && <TermsTab showMessage={showMessage} />}
      {tab === "curricula" && <CurriculaTab showMessage={showMessage} />}
      {tab === "availability" && <AvailabilityTab showMessage={showMessage} />}
    </div>
  );
}

// ─── Departments Tab ────────────────────────────────────────

function DepartmentsTab({ showMessage }: { showMessage: (msg: string, type?: "success" | "error") => void }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await m1Schema.getDepartments();
      setDepartments(data.departments || []);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await m1Schema.createDepartment(newName.trim());
      setNewName("");
      showMessage(`学科「${newName.trim()}」を作成しました`);
      fetchDepartments();
    } catch (e: any) {
      showMessage(`作成エラー: ${e.message}`, "error");
    }
    setLoading(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await m1Schema.updateDepartment(id, editName.trim());
      setEditId(null);
      showMessage("学科を更新しました");
      fetchDepartments();
    } catch (e: any) {
      showMessage(`更新エラー: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`学科「${name}」を削除しますか？関連するカリキュラムも確認してください。`)) return;
    try {
      await m1Schema.deleteDepartment(id);
      showMessage(`学科「${name}」を削除しました`);
      fetchDepartments();
    } catch (e: any) {
      showMessage(`削除エラー: ${e.message}`, "error");
    }
  };

  return (
    <div>
      {/* Create form */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          学科を追加
        </h3>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>学科名</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 情報工学科"
              required
            />
          </div>
          <button type="submit" className="primary" disabled={loading} style={{ marginBottom: "1rem" }}>
            追加
          </button>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          学科一覧 ({departments.length}件)
        </h3>
        {departments.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>データがありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>学科名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                    {d.id.slice(0, 8)}...
                  </td>
                  <td>
                    {editId === d.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(d.id)}
                        autoFocus
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.85rem" }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{d.name}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {editId === d.id ? (
                        <>
                          <button
                            className="primary"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleUpdate(d.id)}
                          >
                            保存
                          </button>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => setEditId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => { setEditId(d.id); setEditName(d.name); }}
                          >
                            編集
                          </button>
                          <button
                            className="danger"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleDelete(d.id, d.name)}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Instructors Tab ────────────────────────────────────────

function InstructorsTab({ showMessage }: { showMessage: (msg: string, type?: "success" | "error") => void }) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchInstructors = useCallback(async () => {
    try {
      const data = await m1Schema.getInstructors();
      setInstructors(data.instructors || []);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchInstructors();
  }, [fetchInstructors]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await m1Schema.createInstructor(newName.trim());
      setNewName("");
      showMessage(`講師「${newName.trim()}」を作成しました`);
      fetchInstructors();
    } catch (e: any) {
      showMessage(`作成エラー: ${e.message}`, "error");
    }
    setLoading(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await m1Schema.updateInstructor(id, editName.trim());
      setEditId(null);
      showMessage("講師を更新しました");
      fetchInstructors();
    } catch (e: any) {
      showMessage(`更新エラー: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`講師「${name}」を削除しますか？`)) return;
    try {
      await m1Schema.deleteInstructor(id);
      showMessage(`講師「${name}」を削除しました`);
      fetchInstructors();
    } catch (e: any) {
      showMessage(`削除エラー: ${e.message}`, "error");
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          講師を追加
        </h3>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>講師名</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 田中太郎"
              required
            />
          </div>
          <button type="submit" className="primary" disabled={loading} style={{ marginBottom: "1rem" }}>
            追加
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          講師一覧 ({instructors.length}件)
        </h3>
        {instructors.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>データがありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>講師名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((inst) => (
                <tr key={inst.id}>
                  <td style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                    {inst.id.slice(0, 8)}...
                  </td>
                  <td>
                    {editId === inst.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(inst.id)}
                        autoFocus
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.85rem" }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{inst.name}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {editId === inst.id ? (
                        <>
                          <button
                            className="primary"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleUpdate(inst.id)}
                          >
                            保存
                          </button>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => setEditId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => { setEditId(inst.id); setEditName(inst.name); }}
                          >
                            編集
                          </button>
                          <button
                            className="danger"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleDelete(inst.id, inst.name)}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Terms Tab ─────────────────────────────────────────────

function TermsTab({ showMessage }: { showMessage: (msg: string, type?: "success" | "error") => void }) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [newName, setNewName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchTerms = useCallback(async () => {
    try {
      const data = await m1Schema.getTerms();
      setTerms(data.terms || []);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (!newStartDate || !newEndDate) {
      showMessage("開始日と終了日は必須です", "error");
      return;
    }
    setLoading(true);
    try {
      await m1Schema.createTerm(newName.trim(), newStartDate, newEndDate);
      setNewName("");
      setNewStartDate("");
      setNewEndDate("");
      showMessage(`ターム「${newName.trim()}」を作成しました`);
      fetchTerms();
    } catch (e: any) {
      showMessage(`作成エラー: ${e.message}`, "error");
    }
    setLoading(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await m1Schema.updateTerm(id, {
        name: editName.trim(),
        startDate: editStartDate,
        endDate: editEndDate,
      });
      setEditId(null);
      showMessage("タームを更新しました");
      fetchTerms();
    } catch (e: any) {
      showMessage(`更新エラー: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`ターム「${name}」を削除しますか？関連する配置データも削除されます。`)) return;
    try {
      await m1Schema.deleteTerm(id);
      showMessage(`ターム「${name}」を削除しました`);
      fetchTerms();
    } catch (e: any) {
      showMessage(`削除エラー: ${e.message}`, "error");
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          タームを追加
        </h3>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: 2, minWidth: 150 }}>
            <label>ターム名</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例: 2026年度前期"
              required
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
            <label>開始日</label>
            <input
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
            <label>終了日</label>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="primary" disabled={loading} style={{ marginBottom: "1rem" }}>
            追加
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          ターム一覧 ({terms.length}件)
        </h3>
        {terms.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>データがありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ターム名</th>
                <th>開始日</th>
                <th>終了日</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id}>
                  <td>
                    {editId === t.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(t.id)}
                        autoFocus
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.85rem" }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{t.name}</span>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8rem" }}>
                    {editId === t.id ? (
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        style={{ padding: "0.15rem 0.3rem", fontSize: "0.8rem" }}
                      />
                    ) : (
                      t.startDate
                    )}
                  </td>
                  <td style={{ fontSize: "0.8rem" }}>
                    {editId === t.id ? (
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        style={{ padding: "0.15rem 0.3rem", fontSize: "0.8rem" }}
                      />
                    ) : (
                      t.endDate
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {editId === t.id ? (
                        <>
                          <button
                            className="primary"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleUpdate(t.id)}
                          >
                            保存
                          </button>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => setEditId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => {
                              setEditId(t.id);
                              setEditName(t.name);
                              setEditStartDate(t.startDate);
                              setEditEndDate(t.endDate);
                            }}
                          >
                            編集
                          </button>
                          <button
                            className="danger"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleDelete(t.id, t.name)}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Curricula Tab ──────────────────────────────────────────

function CurriculaTab({ showMessage }: { showMessage: (msg: string, type?: "success" | "error") => void }) {
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [filterDept, setFilterDept] = useState<string>("");

  // Create form
  const [newName, setNewName] = useState("");
  const [newDeptId, setNewDeptId] = useState("");
  const [newDeptIds, setNewDeptIds] = useState<string[]>([]);
  const [newInstId, setNewInstId] = useState("");
  const [newPeriods, setNewPeriods] = useState<number>(1);
  const [newTermId, setNewTermId] = useState("");
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInstId, setEditInstId] = useState<string>("");
  const [editPeriods, setEditPeriods] = useState<number>(1);
  const [editDeptIds, setEditDeptIds] = useState<string[]>([]);
  const [editTermId, setEditTermId] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [deptData, instData, currData, termData] = await Promise.all([
        m1Schema.getDepartments(),
        m1Schema.getInstructors(),
        m1Schema.getCurricula(),
        m1Schema.getTerms(),
      ]);
      setDepartments(deptData.departments || []);
      setInstructors(instData.instructors || []);
      setCurricula(currData.curricula || []);
      setTerms(termData.terms || []);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDeptId) {
      showMessage("科目名と学科は必須です", "error");
      return;
    }
    setLoading(true);
    try {
      const deptIds = newDeptIds.length > 0 ? newDeptIds : [newDeptId];
      await m1Schema.createCurriculum(
        newDeptId, newName.trim(), newInstId || undefined, newPeriods, deptIds,
        newTermId || undefined
      );
      setNewName("");
      setNewInstId("");
      setNewPeriods(1);
      setNewDeptIds([]);
      setNewTermId("");
      showMessage(`カリキュラム「${newName.trim()}」を作成しました`);
      fetchAll();
    } catch (e: any) {
      showMessage(`作成エラー: ${e.message}`, "error");
    }
    setLoading(false);
  };

  const handleUpdate = async (id: string) => {
    try {
      await m1Schema.updateCurriculum(id, {
        name: editName.trim() || undefined,
        instructorId: editInstId || null,
        periods: editPeriods,
        departmentIds: editDeptIds.length > 0 ? editDeptIds : undefined,
        termId: editTermId || null,
      });
      setEditId(null);
      showMessage("カリキュラムを更新しました");
      fetchAll();
    } catch (e: any) {
      showMessage(`更新エラー: ${e.message}`, "error");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`カリキュラム「${name}」を削除しますか？`)) return;
    try {
      await m1Schema.deleteCurriculum(id);
      showMessage(`カリキュラム「${name}」を削除しました`);
      fetchAll();
    } catch (e: any) {
      showMessage(`削除エラー: ${e.message}`, "error");
    }
  };

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || id.slice(0, 8);
  const getInstName = (id: string | null) => {
    if (!id) return "未アサイン";
    return instructors.find((i) => i.id === id)?.name || id.slice(0, 8);
  };

  const filteredCurricula = filterDept
    ? curricula.filter((c) => c.departmentId === filterDept)
    : curricula;

  return (
    <div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          カリキュラムを追加
        </h3>
        <form onSubmit={handleCreate}>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 2, minWidth: 150 }}>
              <label>科目名</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: プログラミング基礎"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>主学科</label>
              <select value={newDeptId} onChange={(e) => {
                setNewDeptId(e.target.value);
                if (e.target.value && !newDeptIds.includes(e.target.value)) {
                  setNewDeptIds((prev) => [...prev, e.target.value]);
                }
              }} required>
                <option value="">選択してください</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>担当講師</label>
              <select value={newInstId} onChange={(e) => setNewInstId(e.target.value)}>
                <option value="">未アサイン</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 0, minWidth: 80 }}>
              <label>コマ数</label>
              <input
                type="number"
                min={1}
                value={newPeriods}
                onChange={(e) => setNewPeriods(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 70 }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
              <label>ターム</label>
              <select value={newTermId} onChange={(e) => setNewTermId(e.target.value)}>
                <option value="">未設定</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.startDate}~{t.endDate})</option>
                ))}
              </select>
            </div>
            <button type="submit" className="primary" disabled={loading} style={{ marginBottom: "1rem" }}>
              追加
            </button>
          </div>
          {/* 合同学科 (複数選択) */}
          {departments.length > 1 && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                対象学科 (合同授業の場合、複数選択)
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {departments.map((d) => (
                  <label key={d.id} style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.25rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={newDeptIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewDeptIds((prev) => [...prev, d.id]);
                        } else {
                          setNewDeptIds((prev) => prev.filter((id) => id !== d.id));
                        }
                      }}
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
            カリキュラム一覧 ({filteredCurricula.length}件)
          </h3>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
          >
            <option value="">全学科</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        {filteredCurricula.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>データがありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>科目名</th>
                <th>学科</th>
                <th>コマ数</th>
                <th>ターム</th>
                <th>担当講師</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCurricula.map((c) => {
                const deptNames = (c.departmentIds && c.departmentIds.length > 0)
                  ? c.departmentIds.map((id) => getDeptName(id)).join(", ")
                  : getDeptName(c.departmentId);
                return (
                <tr key={c.id}>
                  <td>
                    {editId === c.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.85rem" }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8rem" }}>
                    {editId === c.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                        {departments.map((d) => (
                          <label key={d.id} style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.2rem", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={editDeptIds.includes(d.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditDeptIds((prev) => [...prev, d.id]);
                                } else {
                                  setEditDeptIds((prev) => prev.filter((id) => id !== d.id));
                                }
                              }}
                            />
                            {d.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      deptNames
                    )}
                  </td>
                  <td style={{ fontSize: "0.8rem", textAlign: "center" }}>
                    {editId === c.id ? (
                      <input
                        type="number"
                        min={1}
                        value={editPeriods}
                        onChange={(e) => setEditPeriods(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 50, padding: "0.2rem 0.4rem", fontSize: "0.8rem" }}
                      />
                    ) : (
                      c.periods ?? 1
                    )}
                  </td>
                  <td style={{ fontSize: "0.75rem" }}>
                    {editId === c.id ? (
                      <select
                        value={editTermId}
                        onChange={(e) => setEditTermId(e.target.value)}
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                      >
                        <option value="">未設定</option>
                        {terms.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    ) : (
                      c.termId
                        ? (() => { const t = terms.find((t) => t.id === c.termId); return t ? t.name : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>不明</span>; })()
                        : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>未設定</span>
                    )}
                  </td>
                  <td>
                    {editId === c.id ? (
                      <select
                        value={editInstId}
                        onChange={(e) => setEditInstId(e.target.value)}
                        style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem" }}
                      >
                        <option value="">未アサイン</option>
                        {instructors.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{
                        fontSize: "0.8rem",
                        color: c.instructorId ? "var(--text)" : "var(--text-muted)",
                        fontStyle: c.instructorId ? "normal" : "italic",
                      }}>
                        {getInstName(c.instructorId)}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {editId === c.id ? (
                        <>
                          <button
                            className="primary"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleUpdate(c.id)}
                          >
                            保存
                          </button>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => setEditId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => {
                              setEditId(c.id);
                              setEditName(c.name);
                              setEditInstId(c.instructorId || "");
                              setEditPeriods(c.periods ?? 1);
                              setEditDeptIds(c.departmentIds || [c.departmentId]);
                              setEditTermId(c.termId || "");
                            }}
                          >
                            編集
                          </button>
                          <button
                            className="danger"
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            onClick={() => handleDelete(c.id, c.name)}
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Availability Tab ───────────────────────────────────────

function AvailabilityTab({ showMessage }: { showMessage: (msg: string, type?: "success" | "error") => void }) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedInstructor, setSelectedInstructor] = useState<string>("");
  const [, setSlots] = useState<AvailableSlot[]>([]);
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: 7 }, () => Array.from({ length: PERIODS_COUNT }, () => false))
  );
  const [saving, setSaving] = useState(false);

  const fetchInstructors = useCallback(async () => {
    try {
      const data = await m1Schema.getInstructors();
      setInstructors(data.instructors || []);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchInstructors();
  }, [fetchInstructors]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadAvailability = useCallback(async (instructorId: string) => {
    if (!instructorId) {
      setGrid(Array.from({ length: 7 }, () => Array.from({ length: PERIODS_COUNT }, () => false)));
      setSlots([]);
      return;
    }
    try {
      const data = await m1Schema.getAvailability(instructorId);
      const loadedSlots: AvailableSlot[] = data.slots || [];
      setSlots(loadedSlots);

      // Build grid from slots
      const newGrid = Array.from({ length: 7 }, () =>
        Array.from({ length: PERIODS_COUNT }, () => false)
      );
      for (const slot of loadedSlots) {
        for (const p of slot.periods) {
          if (slot.day >= 0 && slot.day < 7 && p >= 0 && p < PERIODS_COUNT) {
            newGrid[slot.day][p] = true;
          }
        }
      }
      setGrid(newGrid);
    } catch (e: any) {
      showMessage(`取得エラー: ${e.message}`, "error");
    }
  }, [showMessage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selectedInstructor) {
      loadAvailability(selectedInstructor);
    }
  }, [selectedInstructor, loadAvailability]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleCell = (day: number, period: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[day][period] = !next[day][period];
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedInstructor) return;
    setSaving(true);
    try {
      // Convert grid to slots format
      const slotsToSave: { day: number; periods: number[] }[] = [];
      for (let day = 0; day < 7; day++) {
        const periods: number[] = [];
        for (let p = 0; p < PERIODS_COUNT; p++) {
          if (grid[day][p]) periods.push(p);
        }
        if (periods.length > 0) {
          slotsToSave.push({ day, periods });
        }
      }
      await m1Schema.setAvailability(selectedInstructor, slotsToSave);
      showMessage("出講可能スロットを保存しました");
      loadAvailability(selectedInstructor);
    } catch (e: any) {
      showMessage(`保存エラー: ${e.message}`, "error");
    }
    setSaving(false);
  };

  const handleSelectAll = () => {
    setGrid(Array.from({ length: 7 }, () => Array.from({ length: PERIODS_COUNT }, () => true)));
  };

  const handleClearAll = () => {
    setGrid(Array.from({ length: 7 }, () => Array.from({ length: PERIODS_COUNT }, () => false)));
  };

  const selectedCount = grid.flat().filter(Boolean).length;

  return (
    <div>
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.85rem", marginBottom: "0.75rem", color: "var(--text-muted)" }}>
          講師の出講可能スロットを管理
        </h3>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label>講師を選択</label>
            <select
              value={selectedInstructor}
              onChange={(e) => setSelectedInstructor(e.target.value)}
            >
              <option value="">選択してください</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          {selectedInstructor && (
            <>
              <button onClick={handleSelectAll} style={{ marginBottom: "1rem", fontSize: "0.8rem" }}>
                全選択
              </button>
              <button onClick={handleClearAll} style={{ marginBottom: "1rem", fontSize: "0.8rem" }}>
                全解除
              </button>
              <button
                className="primary"
                onClick={handleSave}
                disabled={saving}
                style={{ marginBottom: "1rem" }}
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                選択中: {selectedCount}コマ
              </span>
            </>
          )}
        </div>
      </div>

      {selectedInstructor && (
        <div className="card" style={{ overflowX: "auto" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            セルをクリックして出講可能なコマを選択してください
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.75rem" }}>
            <thead>
              <tr>
                <th style={{ padding: "0.4rem", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  時限
                </th>
                {DAY_LABELS.map((day, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "0.4rem",
                      borderBottom: "1px solid var(--border)",
                      textAlign: "center",
                      minWidth: 50,
                    }}
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PERIODS_COUNT }, (_, period) => (
                <tr key={period}>
                  <td style={{
                    padding: "0.3rem 0.4rem",
                    borderBottom: "1px solid var(--border)",
                    whiteSpace: "nowrap",
                    color: "var(--text-muted)",
                  }}>
                    {getPeriodLabel(period)}
                  </td>
                  {DAY_LABELS.map((_, day) => (
                    <td
                      key={day}
                      onClick={() => toggleCell(day, period)}
                      style={{
                        padding: "0.3rem",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "center",
                        cursor: "pointer",
                        background: grid[day][period] ? "#3FB950" : "transparent",
                        color: grid[day][period] ? "#fff" : "var(--text-muted)",
                        fontWeight: grid[day][period] ? 600 : 400,
                        borderRadius: 2,
                        userSelect: "none",
                        transition: "background 0.1s",
                      }}
                    >
                      {grid[day][period] ? "○" : "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
