import { useState, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  HELP_MODULES,
  PAGE_HELP_MAP,
  filterHelpByRole,
  hasTutorial,
  type HelpTopic,
  type HelpModule,
} from "../lib/help-data";

/**
 * HelpButton — Renders a small "?" button that opens a contextual help overlay.
 * Place this in each page's header to provide context-sensitive help.
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const pageHelp = PAGE_HELP_MAP[location.pathname];
  const filteredModules = filterHelpByRole(HELP_MODULES, user?.role || "general");

  // Find the relevant module and topic for this page
  const relevantModule = pageHelp
    ? filteredModules.find((m) => m.id === pageHelp.moduleId)
    : undefined;

  const findTopic = (topics: HelpTopic[], id: string): HelpTopic | undefined => {
    for (const t of topics) {
      if (t.id === id) return t;
      if (t.children) {
        const found = findTopic(t.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const relevantTopic = pageHelp?.topicId && relevantModule
    ? findTopic(relevantModule.topics, pageHelp.topicId)
    : undefined;

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  return (
    <>
      <button
        className="help-trigger-btn"
        onClick={() => setOpen(true)}
        title="ヘルプを表示"
        aria-label="ヘルプ"
      >
        ?
      </button>

      {open && (
        <HelpOverlayPanel
          quickTip={pageHelp?.quickTip}
          module={relevantModule}
          topic={relevantTopic}
          onClose={close}
        />
      )}
    </>
  );
}

// ─── Overlay Panel ───

interface HelpOverlayPanelProps {
  quickTip?: string;
  module?: HelpModule;
  topic?: HelpTopic;
  onClose: () => void;
}

function HelpOverlayPanel({ quickTip, module, topic, onClose }: HelpOverlayPanelProps) {
  const [expandedTopic, setExpandedTopic] = useState<string | null>(topic?.id || null);
  const navigate = useNavigate();

  const toggleTopic = (id: string) => {
    setExpandedTopic((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="help-overlay-backdrop" onClick={onClose} />
      <div className="help-overlay-panel">
        <div className="help-overlay-header">
          <h3>ヘルプ</h3>
          <button className="help-overlay-close" onClick={onClose} aria-label="閉じる">
            &times;
          </button>
        </div>

        <div className="help-overlay-body">
          {/* Quick tip */}
          {quickTip && (
            <div className="help-quick-tip">
              <div className="help-quick-tip-label">このページについて</div>
              <p>{quickTip}</p>
            </div>
          )}

          {/* Topic detail */}
          {topic && (
            <div className="help-topic-detail">
              <h4>{topic.title}</h4>
              {topic.content.map((p, i) => (
                <p key={i}>{p}</p>
              ))}

              {topic.steps && topic.steps.length > 0 && (
                <div className="help-steps">
                  <div className="help-steps-label">操作手順</div>
                  {topic.steps.map((step, i) => (
                    <div key={i} className="help-step">
                      <div className="help-step-number">{i + 1}</div>
                      <div>
                        <div className="help-step-title">{step.title}</div>
                        <div className="help-step-desc">{step.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {topic.tutorialId && hasTutorial(topic.tutorialId) && (
                <button className="help-tutorial-btn primary" onClick={onClose}>
                  チュートリアルを開始
                </button>
              )}
            </div>
          )}

          {/* Other topics in the same module */}
          {module && (
            <div className="help-other-topics">
              <div className="help-section-label">
                {module.title} の他のトピック
              </div>
              {module.topics
                .filter((t) => t.id !== topic?.id)
                .map((t) => (
                  <TopicAccordion
                    key={t.id}
                    topic={t}
                    expanded={expandedTopic === t.id}
                    onToggle={() => toggleTopic(t.id)}
                  />
                ))}
            </div>
          )}

          {/* Link to full help page */}
          <div className="help-footer-link">
            <button
              onClick={() => {
                onClose();
                navigate("/help");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "0.8rem",
                padding: "0.5rem 0",
              }}
            >
              すべてのヘルプドキュメントを見る →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Topic Accordion ───

interface TopicAccordionProps {
  topic: HelpTopic;
  expanded: boolean;
  onToggle: () => void;
}

function TopicAccordion({ topic, expanded, onToggle }: TopicAccordionProps) {
  return (
    <div className="help-accordion">
      <button className="help-accordion-header" onClick={onToggle}>
        <span>{topic.title}</span>
        <span className="help-accordion-arrow">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="help-accordion-body">
          <p className="help-accordion-summary">{topic.summary}</p>
          {topic.content.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {topic.steps && topic.steps.length > 0 && (
            <div className="help-steps">
              {topic.steps.map((step, i) => (
                <div key={i} className="help-step">
                  <div className="help-step-number">{i + 1}</div>
                  <div>
                    <div className="help-step-title">{step.title}</div>
                    <div className="help-step-desc">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {topic.children && topic.children.length > 0 && (
            <div className="help-children">
              {topic.children.map((child) => (
                <ChildTopic key={child.id} topic={child} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChildTopic({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="help-child-topic">
      <button className="help-child-header" onClick={() => setOpen(!open)}>
        <span>{topic.title}</span>
        <span className="help-accordion-arrow">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <div className="help-child-body">
          {topic.content.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
