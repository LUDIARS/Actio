#include "task_projection.hpp"

namespace actio {
std::string taskDocument(TaskProjection projection) {
    // Keep PostgreSQL booleans, numeric fields and JSON values in their original types.
    // The source timestamps are UTC timestamp-without-time-zone columns.
    std::string columns = R"sql(
        'id', id, 'ownerId', owner_id, 'assigneeId', assignee_id, 'groupId', group_id,
        'projectId', project_id, 'teamId', team_id, 'lane', lane, 'sprintId', sprint_id,
        'source', source, 'sourceRef', source_ref, 'completionScore', completion_score,
        'completedBy', completed_by, 'durationDays', duration_days, 'estimateSource', estimate_source,
        'deadlineSource', deadline_source, 'storyPoints', story_points, 'blockedBy', blocked_by,
        'carriedFromSprintId', carried_from_sprint_id, 'actualMinutes', actual_minutes,
        'executorType', executor_type, 'aiExecutor', ai_executor, 'isCriticalPath', is_critical_path,
        'slackDays', slack_days, 'criticalPathError', critical_path_error,
        'criticalPathComputedAt', to_char(critical_path_computed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'title', title, 'status', status, 'kind', kind, 'publicHidden', public_hidden,
        'creatorType', creator_type, 'category', category, 'priority', priority,
        'deadline', to_char(deadline, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'estimatedMinutes', estimated_minutes, 'pluginId', plugin_id, 'pluginRef', plugin_ref,
        'pluginPayload', plugin_payload,
        'completedAt', to_char(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )sql";
    if (projection != TaskProjection::summary) columns += ", 'description', description";
    if (projection == TaskProjection::full)
        columns += ", 'requirements', requirements, 'completionEvidence', completion_evidence, 'publicSummary', public_summary";
    return "json_build_object(" + columns + ')';
}

portus::Json memoriaTask(const portus::Json& task) {
    const auto& status = task.at("status").as_string();
    const char* mapped = "todo";
    if (status == "in_progress" || status == "blocked") mapped = "doing";
    if (status == "done" || status == "cancelled") mapped = "done";
    return portus::Json::object({
        {"id", task.at("id")}, {"title", task.at("title")}, {"details", task.at("description")},
        {"status", mapped}, {"kind", task.at("kind")}, {"creator_type", task.at("creatorType")},
        {"due_at", task.at("deadline")}, {"category", task.at("category")},
        {"created_at", task.at("createdAt")}, {"updated_at", task.at("updatedAt")}
    });
}
}
