/**
 * Workflow / state machine registry — Issue #111 D2
 *
 * プラグインは `defineModule({ workflow })` で target (event/task) に
 * 対する状態遷移を宣言する. 現時点では 1 target につき 1 workflow
 * (最後に登録された定義が勝つ) の単純モデル.
 *
 * 遷移検証は `assertTransition(target, from, to, role)` で行う。
 * REST ハンドラ側が Task.status 変更時にこれを呼ぶ運用.
 */

import type { WorkflowDefinition, WsRequiredRole } from "@ludiars/schedula-sdk";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

class WorkflowRegistry {
  private byTarget = new Map<"event" | "task", WorkflowDefinition & { moduleId: string }>();

  register(moduleId: string, def: WorkflowDefinition): void {
    this.byTarget.set(def.target, { ...def, moduleId });
  }

  unregister(moduleId: string): void {
    for (const [k, v] of this.byTarget) {
      if (v.moduleId === moduleId) this.byTarget.delete(k);
    }
  }

  get(target: "event" | "task"): (WorkflowDefinition & { moduleId: string }) | undefined {
    return this.byTarget.get(target);
  }

  /** 許可されていない遷移で throw. role チェックもここで行う. */
  assertTransition(
    target: "event" | "task",
    from: string,
    to: string,
    role: WsRequiredRole | "general",
  ): void {
    const wf = this.byTarget.get(target);
    if (!wf) return;   // ワークフロー未登録なら従来どおり自由遷移
    if (!wf.states.includes(to)) {
      throw new WorkflowError(`[workflow:${target}] unknown state "${to}"`);
    }
    const transition = wf.transitions.find((t) => t.from === from && t.to === to);
    if (!transition) {
      throw new WorkflowError(
        `[workflow:${target}] transition "${from}" -> "${to}" is not defined`,
      );
    }
    if (transition.requireRole) {
      if (role === "general") {
        throw new WorkflowError(
          `[workflow:${target}] transition "${from}" -> "${to}" requires role "${transition.requireRole}"`,
        );
      }
      const required = rank(transition.requireRole);
      const actual   = rank(role as WsRequiredRole);
      if (actual < required) {
        throw new WorkflowError(
          `[workflow:${target}] transition "${from}" -> "${to}" requires role "${transition.requireRole}"`,
        );
      }
    }
  }

  /** 初期状態を返す. ワークフロー未登録なら undefined. */
  initialState(target: "event" | "task"): string | undefined {
    return this.byTarget.get(target)?.initial;
  }

  __clearForTest(): void { this.byTarget.clear(); }
}

function rank(role: WsRequiredRole): number {
  switch (role) {
    case "system_admin":  return 100;
    case "group_owner":   return 3;
    case "group_leader":  return 2;
    case "group_member":  return 1;
  }
  return 0;
}

export const workflowRegistry = new WorkflowRegistry();
