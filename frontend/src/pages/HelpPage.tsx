import { useState, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  HELP_MODULES,
  filterHelpByRole,
  hasTutorial,
  type HelpModule,
  type HelpTopic,
} from "../lib/help-data";

export function HelpPage() {
  const { user } = useAuth();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const filteredModules = useMemo(
    () => filterHelpByRole(HELP_MODULES, user?.role || "general"),
    [user?.role],
  );

  // Search filtering
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const results: Array<{ module: HelpModule; topic: HelpTopic; parent?: HelpTopic }> = [];

    for (const mod of filteredModules) {
      const searchTopics = (topics: HelpTopic[], parent?: HelpTopic) => {
        for (const topic of topics) {
          const matches =
            topic.title.toLowerCase().includes(q) ||
            topic.summary.toLowerCase().includes(q) ||
            topic.content.some((c) => c.toLowerCase().includes(q));
          if (matches) {
            results.push({ module: mod, topic, parent });
          }
          if (topic.children) {
            searchTopics(topic.children, topic);
          }
        }
      };
      searchTopics(mod.topics);
    }
    return results;
  }, [searchQuery, filteredModules]);

  const selectedModule = selectedModuleId
    ? filteredModules.find((m) => m.id === selectedModuleId)
    : null;

  const toggleTopic = (id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectModuleAndTopic = (moduleId: string, topicId: string) => {
    setSelectedModuleId(moduleId);
    setExpandedTopics(new Set([topicId]));
    setSearchQuery("");
  };

  return (
    <div>
      <div className="page-header">
        <h1>ヘルプ・ドキュメント</h1>
        <p>Schedula の操作方法とワークフローガイド</p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder="ヘルプを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 400 }}
        />
      </div>

      {/* Search Results */}
      {searchResults && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            {searchResults.length} 件の検索結果
          </div>
          {searchResults.length === 0 ? (
            <div className="empty-state">
              <p>「{searchQuery}」に一致するヘルプ記事が見つかりませんでした。</p>
            </div>
          ) : (
            <div className="flex-col" style={{ gap: "0.5rem" }}>
              {searchResults.map(({ module, topic, parent }) => (
                <button
                  key={`${module.id}-${topic.id}`}
                  className="help-search-result card"
                  onClick={() => selectModuleAndTopic(module.id, topic.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span className="badge blue">{module.title}</span>
                    {parent && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {parent.title} &gt;
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", textAlign: "left" }}>
                    {topic.title}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "left" }}>
                    {topic.summary}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Module list / Topic view */}
      {!searchResults && (
        <div className="help-page-layout">
          {/* Module list sidebar */}
          <div className="help-module-list">
            {filteredModules.map((mod) => (
              <button
                key={mod.id}
                className={`help-module-card card ${selectedModuleId === mod.id ? "help-module-card--active" : ""}`}
                onClick={() => {
                  setSelectedModuleId(mod.id === selectedModuleId ? null : mod.id);
                  setExpandedTopics(new Set());
                }}
              >
                <div className="help-module-icon">{mod.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{mod.title}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {mod.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Topic detail area */}
          <div className="help-topic-area">
            {!selectedModule ? (
              <div className="empty-state">
                <p>左のメニューからモジュールを選択してください</p>
              </div>
            ) : (
              <div>
                <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
                  {selectedModule.title}
                </h2>
                <div className="flex-col">
                  {selectedModule.topics.map((topic) => (
                    <HelpTopicCard
                      key={topic.id}
                      topic={topic}
                      expanded={expandedTopics.has(topic.id)}
                      onToggle={() => toggleTopic(topic.id)}
                      expandedTopics={expandedTopics}
                      onToggleTopic={toggleTopic}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Topic Card ───

interface HelpTopicCardProps {
  topic: HelpTopic;
  expanded: boolean;
  onToggle: () => void;
  expandedTopics: Set<string>;
  onToggleTopic: (id: string) => void;
  depth?: number;
}

function HelpTopicCard({ topic, expanded, onToggle, expandedTopics, onToggleTopic, depth = 0 }: HelpTopicCardProps) {
  return (
    <div className={`card help-topic-card ${depth > 0 ? "help-topic-card--child" : ""}`}>
      <button
        className="help-topic-card-header"
        onClick={onToggle}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: depth > 0 ? "0.8rem" : "0.9rem" }}>
            {topic.title}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {topic.summary}
          </div>
        </div>
        <span className="help-accordion-arrow">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && (
        <div className="help-topic-card-body">
          {topic.content.map((p, i) => (
            <p key={i} style={{ fontSize: "0.85rem", marginBottom: "0.5rem", lineHeight: 1.6 }}>
              {p}
            </p>
          ))}

          {/* Workflow steps */}
          {topic.steps && topic.steps.length > 0 && (
            <div className="help-steps" style={{ marginTop: "0.75rem" }}>
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

          {/* Tutorial button placeholder */}
          {topic.tutorialId && hasTutorial(topic.tutorialId) && (
            <div style={{ marginTop: "0.75rem" }}>
              <button className="primary" style={{ fontSize: "0.8rem" }}>
                チュートリアルを開始
              </button>
            </div>
          )}

          {/* Tutorial ID info (for developers / future use) */}
          {topic.tutorialId && !hasTutorial(topic.tutorialId) && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.5rem",
                background: "var(--bg-surface-2)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
              }}
            >
              チュートリアル準備中 (ID: {topic.tutorialId})
            </div>
          )}

          {/* Children topics */}
          {topic.children && topic.children.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 600 }}>
                詳細トピック
              </div>
              <div className="flex-col" style={{ gap: "0.5rem" }}>
                {topic.children.map((child) => (
                  <HelpTopicCard
                    key={child.id}
                    topic={child}
                    expanded={expandedTopics.has(child.id)}
                    onToggle={() => onToggleTopic(child.id)}
                    expandedTopics={expandedTopics}
                    onToggleTopic={onToggleTopic}
                    depth={depth + 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
