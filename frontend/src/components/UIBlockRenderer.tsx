/**
 * UIBlockRenderer — 指定スロットのUIブロックを描画するコンポーネント
 *
 * 使い方:
 *   <UIBlockRenderer slot="dashboard-main" />
 *
 * ブロックの表示/非表示はユーザー設定 (localStorage) で制御。
 */
import { useState, useCallback } from "react";
import { moduleRegistry } from "../lib/module-registry";
import type { UIBlock, UIBlockSlot } from "../lib/module-registry";
import { useAuth } from "../contexts/AuthContext";

const HIDDEN_BLOCKS_KEY = "schedula_hidden_blocks";

function getHiddenBlocks(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_BLOCKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setHiddenBlocks(hidden: string[]): void {
  localStorage.setItem(HIDDEN_BLOCKS_KEY, JSON.stringify(hidden));
}

interface UIBlockRendererProps {
  slot: UIBlockSlot;
  /** 編集モード: ブロックの表示/非表示を切り替えられる */
  editMode?: boolean;
}

/** ロールがブロックの要件を満たすか判定 */
function meetsRoleRequirement(
  userRole: string | undefined,
  requiredRole: UIBlock["requiredRole"]
): boolean {
  if (!requiredRole) return true;
  if (!userRole) return false;
  if (requiredRole === "admin") return userRole === "admin";
  if (requiredRole === "group_leader")
    return userRole === "admin" || userRole === "group_leader";
  return true;
}

export function UIBlockRenderer({ slot, editMode = false }: UIBlockRendererProps) {
  const { user } = useAuth();
  const [hiddenBlocks, setHiddenBlocksState] = useState<string[]>(getHiddenBlocks);

  const toggleBlock = useCallback((blockId: string) => {
    setHiddenBlocksState((prev) => {
      const next = prev.includes(blockId)
        ? prev.filter((id) => id !== blockId)
        : [...prev, blockId];
      setHiddenBlocks(next);
      return next;
    });
  }, []);

  const blocks = moduleRegistry.getBlocks(slot);

  const visibleBlocks = blocks.filter((block) => {
    if (!meetsRoleRequirement(user?.role, block.requiredRole)) return false;
    if (!editMode && hiddenBlocks.includes(block.id)) return false;
    // デフォルト非表示のブロックは、明示的に表示設定されていない限り非表示
    if (!editMode && block.defaultVisible === false && !hiddenBlocks.includes(block.id)) {
      // defaultVisible=false で hiddenBlocks に入っていない = まだ表示設定されていない
      // → 非表示扱い (toggleで明示的にhiddenBlocksに入れる仕組みを将来拡張)
    }
    return true;
  });

  if (visibleBlocks.length === 0 && !editMode) return null;

  const displayBlocks = editMode ? blocks.filter((b) => meetsRoleRequirement(user?.role, b.requiredRole)) : visibleBlocks;

  return (
    <div className="ui-block-container" data-slot={slot}>
      {displayBlocks.map((block) => {
        const isHidden = hiddenBlocks.includes(block.id);
        const BlockComponent = block.component;
        return (
          <div
            key={block.id}
            className={`ui-block ui-block--${block.size ?? "full"}`}
            style={{
              opacity: editMode && isHidden ? 0.5 : 1,
              position: "relative",
            }}
            data-block-id={block.id}
          >
            {editMode && (
              <button
                onClick={() => toggleBlock(block.id)}
                style={{
                  position: "absolute",
                  top: "0.25rem",
                  right: "0.25rem",
                  zIndex: 10,
                  background: isHidden ? "var(--green)" : "var(--red)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.1rem 0.4rem",
                  fontSize: "0.7rem",
                  cursor: "pointer",
                }}
                title={isHidden ? "ブロックを表示" : "ブロックを非表示"}
              >
                {isHidden ? "+" : "−"}
              </button>
            )}
            {(!isHidden || editMode) && (
              <BlockComponent blockId={block.id} />
            )}
          </div>
        );
      })}
    </div>
  );
}
