import { useEffect, useState } from "react";
import { adminApi, type TeamMembership } from "../lib/api";
import { planningApi, type Team } from "../lib/planning-api";

export function TeamMembershipEditor({ user, onClose }: {
  user: { id: string; name: string }; onClose: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const userId = user.id;

  useEffect(() => {
    let active = true;
    Promise.all([
      planningApi.teams(),
      adminApi.listTeamMemberships(userId),
    ]).then(([available, current]) => {
      if (!active) return;
      setTeams(available.teams);
      setMemberships(current.memberships);
    }).catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  async function change(teamId: string, add: boolean) {
    setSaving(true);
    setError("");
    try {
      await adminApi.setTeamMembership(teamId, userId, add);
      setMemberships(previous => add
        ? [...previous, { teamId, role: "member" }]
        : previous.filter(m => m.teamId !== teamId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="card">
    <h2>{user.name} の所属組織</h2>
    {error && <p role="alert">{error}</p>}
    {loading && <p>読み込み中…</p>}
    {!loading && !error && !teams.length && <p>登録済みの組織はありません。</p>}
    {teams.map(team => <div key={team.id}><label>
      <input type="checkbox" disabled={saving} checked={memberships.some(m => m.teamId === team.id)}
        onChange={event => void change(team.id, event.target.checked)} />
      {team.name ?? team.id}
    </label></div>)}
    <button onClick={onClose} disabled={saving}>閉じる</button>
  </section>;
}
