import type { TeamMember } from "../../lib/planning-api";

const AI_MEMBER_PREFIX = "ai:";

/** 責任者の id が AI メンバー (`ai:<call_name>`) なら call_name、それ以外は null。 */
export function aiAssigneeCallName(assigneeId: string | null | undefined): string | null {
  if (!assigneeId || !assigneeId.startsWith(AI_MEMBER_PREFIX)) return null;
  return assigneeId.slice(AI_MEMBER_PREFIX.length) || null;
}

export function memberLabel(member: TeamMember): string {
  return member.kind === "ai" ? `AI: ${member.callName ?? member.userId}` : member.userId;
}

/** 担当者 (責任者) の選択肢。人間と AI メンバーを分けて並べる。 */
export function AssigneeOptions({ members }: { members: TeamMember[] }) {
  const humans = members.filter(member => member.kind !== "ai");
  const ai = members.filter(member => member.kind === "ai");
  return <>
    <option value="">選択</option>
    {humans.map(member => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
    {ai.length > 0 && <optgroup label="AI メンバー">
      {ai.map(member => <option key={member.userId} value={member.userId}>{memberLabel(member)}</option>)}
    </optgroup>}
  </>;
}

/** 一覧・計画表に出す AI 責任者のバッジ。人間の責任者では何も出さない。 */
export function AiAssigneeBadge({ assigneeId }: { assigneeId: string | null | undefined }) {
  const callName = aiAssigneeCallName(assigneeId);
  if (!callName) return null;
  return <span className="ai-assignee-badge" title="責任者は AI メンバーです" style={{
    padding: "0.1rem 0.4rem", border: "1px solid var(--accent)", color: "var(--accent)",
    borderRadius: "var(--radius-sm)", fontSize: "0.7rem", whiteSpace: "nowrap",
  }}>責任者: AI ({callName})</span>;
}
