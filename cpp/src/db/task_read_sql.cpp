#include "task_read_sql.hpp"
#include <cstdint>

namespace actio {
namespace {
constexpr std::string_view priorityRank =
    "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'low' THEN 3 ELSE 2 END";
constexpr std::string_view personalRank =
    "CASE status WHEN 'open' THEN 0 WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 "
    "WHEN 'doing' THEN 1 WHEN 'done' THEN 2 ELSE 3 END";

std::string epochBound(TaskReadSql& sql, const portus::Json& ms) {
    std::optional<std::string> value;
    if (!ms.is_null()) value = std::to_string(static_cast<std::int64_t>(ms.as_number()));
    return "(timestamp 'epoch' + " + sql.bind(std::move(value)) + "::bigint * interval '1 millisecond')";
}

void addDate(TaskReadSql& sql, std::string_view comparison, const std::optional<std::string>& input) {
    if (input) sql.text += " AND " + std::string(comparison)
        + " (timestamp 'epoch' + " + sql.bind(input) + "::bigint * interval '1 millisecond')";
}
}

std::string TaskReadSql::bind(std::optional<std::string> value) {
    values.push_back(std::move(value));
    return "$" + std::to_string(values.size());
}

std::vector<portus::DbRow> TaskReadSql::query(portus::DbConnection& connection, portus::DbDeadline deadline,
                                           std::size_t limit) const {
    std::vector<portus::DbText> refs;
    refs.reserve(values.size());
    for (const auto& value : values) {
        if (value) refs.emplace_back(std::string_view(*value));
        else refs.emplace_back(std::nullopt);
    }
    return connection.query({text, std::move(refs), limit}, deadline);
}

void addTaskFilters(TaskReadSql& sql, const TaskListQuery& input) {
    // The column names are fixed by this table. Request values are bound separately.
    const std::pair<std::string_view, const std::string&> filters[]{
        {"owner_id", input.owner}, {"assignee_id", input.assignee}, {"group_id", input.group},
        {"team_id", input.team}, {"project_id", input.project}, {"plugin_id", input.plugin},
        {"lane", input.lane}, {"sprint_id", input.sprint}, {"executor_type", input.executor},
        {"assignee_id", input.extraAssignee}
    };
    for (const auto& [column, value] : filters) {
        if (!value.empty()) sql.text += " AND " + std::string(column) + " = " + sql.bind(value);
    }
    if (!input.kind.empty() && input.kind != "all") sql.text += " AND kind = " + sql.bind(input.kind);
    if (!input.statuses.empty()) {
        std::string joined;
        for (const auto& status : input.statuses) {
            if (!joined.empty()) joined += ',';
            joined += status;
        }
        sql.text += " AND status = ANY (string_to_array(" + sql.bind(joined) + ", ','))";
    }
    if (!input.title.empty()) sql.text += " AND strpos(lower(title), lower(" + sql.bind(input.title) + ")) > 0";
    if (!input.category.empty()) sql.text +=
        " AND strpos(',' || replace(category, ' ', '') || ',', ',' || regexp_replace("
        + sql.bind(input.category) + ", '[[:space:]]', '', 'g') || ',') > 0";
    addDate(sql, "updated_at >=", input.updatedSince);
    addDate(sql, "deadline >=", input.dueAfter);
    addDate(sql, "deadline <=", input.dueBefore);
}

void addTaskPageBound(TaskReadSql& sql, const TaskListQuery& input) {
    if (!input.after) return;
    const auto& key = *input.after;
    const auto id = sql.bind(key.at("id").as_string());
    if (input.sort == TaskSort::updated) {
        sql.text += " AND (updated_at, id) < (" + epochBound(sql, key.at("updatedAt")) + ", " + id + ')';
        return;
    }
    const auto rank = sql.bind(key.at("rank").dump()) + "::double precision";
    if (input.sort == TaskSort::priority) {
        sql.text += " AND (" + std::string(priorityRank) + ", id) > (" + rank + ", " + id + ')';
        return;
    }
    const auto due = epochBound(sql, key.at("deadline"));
    const auto created = epochBound(sql, key.at("createdAt"));
    const std::string order(personalRank);
    sql.text += " AND (" + order + " > " + rank + " OR (" + order + " = " + rank
        + " AND ((" + due + " IS NOT NULL AND (deadline IS NULL OR deadline > " + due + ")) OR "
        + "(deadline IS NOT DISTINCT FROM " + due + " AND (created_at, id) < (" + created + ", " + id + ")))))";
}

std::string taskPageOrder(TaskSort sort) {
    if (sort == TaskSort::priority) return std::string(priorityRank) + ", id ASC";
    if (sort == TaskSort::personal)
        return std::string(personalRank) + ", deadline ASC NULLS LAST, created_at DESC, id DESC";
    return "updated_at DESC, id DESC";
}

std::string taskPageKeys(TaskSort sort) {
    const auto rank = sort == TaskSort::personal ? personalRank : priorityRank;
    return "id, floor(extract(epoch from updated_at) * 1000)::bigint, "
        "floor(extract(epoch from created_at) * 1000)::bigint, "
        "floor(extract(epoch from deadline) * 1000)::bigint, " + std::string(rank);
}
}
