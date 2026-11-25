#include "task_notifications.hpp"
#include <cstdio>
#include "portus/env.hpp"
#include "portus/id.hpp"

namespace actio {
namespace {
using portus::Json;

int priorityRank(std::string_view priority) {
    if (priority == "critical") return 3;
    if (priority == "high") return 2;
    return priority == "medium" ? 1 : 0;
}

std::string executorLabel(const Json& task) {
    if (task.at("executorType") != Json("ai")) return "人間";
    const auto& executor = task.at("aiExecutor").as_string();
    return executor.empty() ? "AI (未割り当て)" : "AI (" + executor + ')';
}

void enqueue(portus::DbConnection& connection, portus::DbDeadline deadline, const Json& task,
             std::string_view event, const std::string& suffix,
             const std::string& title, const std::string& body) {
    const auto& taskId = task.at("id").as_string();
    const auto& teamId = task.at("teamId");
    const bool forTeam = !teamId.as_string().empty();
    auto link = portus::get_env("FRONTEND_URL");
    while (link.ends_with('/')) link.pop_back();
    link += forTeam ? "/tasks/planning" : "/tasks";
    const auto payload = forTeam
        ? Json::object({{"kind", "task-kanban"}, {"title", title}, {"body", link + "\n\n" + body}})
        : Json::object({{"title", title}, {"body", body}, {"url", link}, {"source", "actio"},
                        {"event", event}, {"task_id", taskId}});
    const auto id = portus::uuidv4();
    const auto key = std::string(event) + ':' + taskId + suffix + ':' + task.at("updatedAt").as_string();
    const auto document = payload.dump();
    const portus::DbText team = teamId.is_null() ? portus::DbText{} : portus::DbText{teamId.as_string()};
    connection.query({R"sql(
        INSERT INTO task_notifications(id,task_id,team_id,event,channel,dedupe_key,payload,status,attempts,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'pending',0,now() AT TIME ZONE 'UTC')
        ON CONFLICT(dedupe_key) DO NOTHING
        )sql", {id, taskId, team, event, forTeam ? "concordia" : "memoria", key, document}, 0}, deadline);
}
}

void queueTaskNotifications(portus::DbConnection& connection, portus::DbDeadline deadline,
                            const Json& before, const Json& after) {
    try {
        const auto& title = after.at("title").as_string();
        const auto& assignee = after.at("assigneeId");
        if (!assignee.as_string().empty() && assignee != before.at("assigneeId") && assignee != after.at("ownerId"))
            enqueue(connection, deadline, after, "task.assigned", ':' + assignee.as_string(),
                    "担当が割り当てられました: " + title, "作業者: " + executorLabel(after));
        if (before.is_null()) return;
        if (before.at("status") != Json("done") && after.at("status") == Json("done"))
            enqueue(connection, deadline, after, "task.completed", {},
                    "タスクが完了しました: " + title, "作業者: " + executorLabel(after));
        const auto& previous = before.at("priority").as_string();
        const auto& current = after.at("priority").as_string();
        if (priorityRank(current) > priorityRank(previous))
            enqueue(connection, deadline, after, "task.priority_raised", ':' + current,
                    "優先度が上がりました: " + title, previous + " → " + current);
        if (before.at("executorType") != after.at("executorType") || before.at("aiExecutor") != after.at("aiExecutor"))
            enqueue(connection, deadline, after, "task.executor_changed",
                    ':' + after.at("executorType").as_string() + ':' + after.at("aiExecutor").as_string(),
                    "作業者が変わりました: " + title, executorLabel(before) + " → " + executorLabel(after));
    } catch (const std::exception&) {
        // Delivery is ancillary and the task mutation has already committed.
        std::fputs("Actio could not queue task notifications\n", stderr);
    }
}
}
