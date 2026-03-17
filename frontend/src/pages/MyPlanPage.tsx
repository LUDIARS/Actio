import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { myPlanApi } from "../lib/api";
import { DAY_LABELS, getPeriodLabel } from "../lib/constants";

interface MyPlan {
  id: string;
  name: string;
  patternType: "basic" | "special";
  validFrom: string | null;
  validUntil: string | null;
  weeklySchedule: Record<string, Array<{ period: number; duration: number; title: string }>>;
  isActive: boolean;
  priority: number;
  groupId: string | null;
}

interface ScheduleSlot {
  period: number;
  duration: number;
  title: string;
}

export function MyPlanPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<MyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MyPlan | null>(null);

  // フォーム
  const [form, setForm] = useState({
    name: "",
    patternType: "basic" as "basic" | "special",
    validFrom: "",
    validUntil: "",
    weeklySchedule: {} as Record<string, ScheduleSlot[]>,
  });

  // 新しいスロット追加用
  const [slotForm, setSlotForm] = useState({
    day: 0,
    period: 0,
    duration: 1,
    title: "",
  });

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await myPlanApi.list();
      setPlans(data.plans || []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await myPlanApi.create({
        name: form.name,
        patternType: form.patternType,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || undefined,
        weeklySchedule: form.weeklySchedule,
      });
      setShowForm(false);
      resetForm();
      await loadPlans();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setError("");
    try {
      await myPlanApi.update(editingPlan.id, {
        name: form.name,
        patternType: form.patternType,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || undefined,
        weeklySchedule: form.weeklySchedule,
      });
      setEditingPlan(null);
      setShowForm(false);
      resetForm();
      await loadPlans();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle = async (plan: MyPlan) => {
    try {
      await myPlanApi.update(plan.id, { isActive: !plan.isActive });
      await loadPlans();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このマイプランを削除しますか？")) return;
    try {
      await myPlanApi.remove(id);
      if (editingPlan?.id === id) {
        setEditingPlan(null);
        setShowForm(false);
        resetForm();
      }
      await loadPlans();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (plan: MyPlan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      patternType: plan.patternType,
      validFrom: plan.validFrom || "",
      validUntil: plan.validUntil || "",
      weeklySchedule: { ...plan.weeklySchedule },
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      name: "",
      patternType: "basic",
      validFrom: "",
      validUntil: "",
      weeklySchedule: {},
    });
    setEditingPlan(null);
  };

  const addSlot = () => {
    if (!slotForm.title) {
      setError("タイトルを入力してください");
      return;
    }
    const dayKey = String(slotForm.day);
    const existing = form.weeklySchedule[dayKey] || [];
    setForm((f) => ({
      ...f,
      weeklySchedule: {
        ...f.weeklySchedule,
        [dayKey]: [...existing, { period: slotForm.period, duration: slotForm.duration, title: slotForm.title }],
      },
    }));
    setSlotForm({ day: 0, period: 0, duration: 1, title: "" });
  };

  const removeSlot = (dayKey: string, index: number) => {
    setForm((f) => {
      const updated = { ...f.weeklySchedule };
      const arr = [...(updated[dayKey] || [])];
      arr.splice(index, 1);
      if (arr.length === 0) {
        delete updated[dayKey];
      } else {
        updated[dayKey] = arr;
      }
      return { ...f, weeklySchedule: updated };
    });
  };

  // 週間ビュー
  const allSlots = Object.entries(form.weeklySchedule).flatMap(([dayKey, slots]) =>
    slots.map((s) => ({ ...s, day: parseInt(dayKey) }))
  );
  allSlots.sort((a, b) => a.day - b.day || a.period - b.period);

  // active plans - sorted by priority (special > basic)
  const activePlans = plans.filter((p) => p.isActive);
  const basicPlans = plans.filter((p) => p.patternType === "basic");
  const specialPlans = plans.filter((p) => p.patternType === "special");

  return (
    <div>
      <div className="page-header">
        <h1>マイプラン</h1>
        <p>週間ルーティーンを設定すると、今後の予定が自動的に組み上がります</p>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(248, 81, 73, 0.1)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            fontSize: "0.85rem",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      )}

      {/* 説明 */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <p style={{ marginBottom: "0.3rem" }}>
            <strong>基本パターン</strong>: 通常の週間ルーティーン。常に適用されます。
          </p>
          <p>
            <strong>特別パターン</strong>: 期間限定のルーティーン。基本パターンより優先されます。
          </p>
        </div>
      </div>

      {/* 作成ボタン */}
      <div className="toolbar" style={{ marginBottom: "1rem" }}>
        <button
          className="primary"
          onClick={() => {
            if (showForm && !editingPlan) {
              setShowForm(false);
              resetForm();
            } else {
              setShowForm(true);
              resetForm();
            }
          }}
        >
          {showForm && !editingPlan ? "キャンセル" : "マイプランを作成"}
        </button>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          基本: {basicPlans.length}件 / 特別: {specialPlans.length}件
        </span>
      </div>

      {/* フォーム */}
      {showForm && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <form onSubmit={editingPlan ? handleUpdate : handleCreate}>
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>
              {editingPlan ? "マイプランを編集" : "新しいマイプラン"}
            </h3>

            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                <label>プラン名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例: 通常期間、試験期間"
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
                <label>パターン種別</label>
                <select
                  value={form.patternType}
                  onChange={(e) => setForm((f) => ({ ...f, patternType: e.target.value as "basic" | "special" }))}
                >
                  <option value="basic">基本パターン</option>
                  <option value="special">特別パターン (優先)</option>
                </select>
              </div>
            </div>

            {form.patternType === "special" && (
              <div style={{ display: "flex", gap: "1rem" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>適用開始日</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>適用終了日</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* 週間スケジュール入力 */}
            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                週間スケジュール
              </h4>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "0.75rem" }}>
                <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                  <label>タイトル</label>
                  <input
                    type="text"
                    value={slotForm.title}
                    onChange={(e) => setSlotForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="例: 自習、バイト"
                  />
                </div>
                <div className="form-group" style={{ minWidth: 80 }}>
                  <label>曜日</label>
                  <select
                    value={slotForm.day}
                    onChange={(e) => setSlotForm((f) => ({ ...f, day: parseInt(e.target.value) }))}
                  >
                    {DAY_LABELS.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ minWidth: 100 }}>
                  <label>時限</label>
                  <select
                    value={slotForm.period}
                    onChange={(e) => setSlotForm((f) => ({ ...f, period: parseInt(e.target.value) }))}
                  >
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i} value={i}>{getPeriodLabel(i)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ minWidth: 80 }}>
                  <label>コマ数</label>
                  <select
                    value={slotForm.duration}
                    onChange={(e) => setSlotForm((f) => ({ ...f, duration: parseInt(e.target.value) }))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={addSlot} style={{ marginBottom: "1rem", fontSize: "0.8rem" }}>
                  スロット追加
                </button>
              </div>

              {/* 登録済みスロット表示 */}
              {allSlots.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginBottom: "1rem" }}>
                  {allSlots.map((slot, i) => (
                    <div
                      key={`${slot.day}-${slot.period}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.3rem 0.5rem",
                        background: "var(--bg-surface-2)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.8rem",
                      }}
                    >
                      <span className="badge blue" style={{ fontSize: "0.65rem" }}>{DAY_LABELS[slot.day]}</span>
                      <span style={{ color: "var(--text-muted)", minWidth: 80 }}>
                        {getPeriodLabel(slot.period).split("(")[0]}
                      </span>
                      <span style={{ fontWeight: 500 }}>{slot.title}</span>
                      {slot.duration > 1 && (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
                          ({slot.duration}コマ)
                        </span>
                      )}
                      <button
                        type="button"
                        className="danger"
                        style={{ padding: "0.1rem 0.3rem", fontSize: "0.7rem", marginLeft: "auto" }}
                        onClick={() => removeSlot(String(slot.day), (form.weeklySchedule[String(slot.day)] || []).indexOf(slot))}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1rem" }}>
                  スロットを追加してください
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="primary">
                {editingPlan ? "更新" : "作成"}
              </button>
              {editingPlan && (
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}>
                  キャンセル
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* プラン一覧 */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>読み込み中...</div>
      ) : plans.length === 0 ? (
        <div className="empty-state">
          <p>マイプランがありません</p>
          <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
            上の「マイプランを作成」ボタンから、週間ルーティーンを設定できます
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {plans.map((plan) => {
            const slots = Object.entries(plan.weeklySchedule).flatMap(([dayKey, ss]) =>
              ss.map((s) => ({ ...s, day: parseInt(dayKey) }))
            );
            slots.sort((a, b) => a.day - b.day || a.period - b.period);

            return (
              <div
                key={plan.id}
                className="card"
                style={{
                  opacity: plan.isActive ? 1 : 0.5,
                  borderLeft: `3px solid ${plan.patternType === "special" ? "var(--orange)" : "var(--accent)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 600 }}>{plan.name}</h3>
                    <span className={`badge ${plan.patternType === "special" ? "orange" : "blue"}`}>
                      {plan.patternType === "basic" ? "基本" : "特別"}
                    </span>
                    <span className={`badge ${plan.isActive ? "green" : "red"}`}>
                      {plan.isActive ? "有効" : "無効"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleEdit(plan)}
                    >
                      編集
                    </button>
                    <button
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleToggle(plan)}
                    >
                      {plan.isActive ? "無効化" : "有効化"}
                    </button>
                    <button
                      className="danger"
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => handleDelete(plan.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>

                {plan.patternType === "special" && (plan.validFrom || plan.validUntil) && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    期間: {plan.validFrom || "開始なし"} 〜 {plan.validUntil || "終了なし"}
                  </div>
                )}

                {slots.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                    {slots.map((s, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "0.2rem 0.5rem",
                          background: "var(--bg-surface-2)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.75rem",
                        }}
                      >
                        {DAY_LABELS[s.day]} {s.period + 1}限 {s.title}
                        {s.duration > 1 && ` (${s.duration}コマ)`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
