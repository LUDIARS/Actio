#pragma once
#include <cstddef>
#include <optional>
#include <string>
#include <string_view>
#include <vector>
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
inline constexpr std::size_t task_page_max = 500;
enum class TaskSort { updated, personal, priority };

// Validated paging controls and filters for the authenticated loopback owner.
struct TaskListQuery {
    TaskSort sort = TaskSort::updated;
    std::size_t limit = 100;
    std::optional<portus::Json> after;
    bool includeDescription = false;
    bool memoria = false;
    bool currentSprint = false;
    std::string owner;
    std::string assignee;
    std::string group;
    std::string team;
    std::string project;
    std::string plugin;
    std::string kind;
    std::string lane;
    std::string sprint;
    std::string executor;
    std::string title;
    std::string category;
    std::string extraAssignee;
    std::optional<std::string> updatedSince;
    std::optional<std::string> dueAfter;
    std::optional<std::string> dueBefore;
    std::vector<std::string> statuses;
};

// Decode a Node-compatible v1 cursor for the selected sort.
std::optional<portus::Json> decodeTaskCursor(std::string_view raw, TaskSort sort);
// Encode the last visible row's sort keys as a v1 cursor.
std::string encodeTaskCursor(const portus::DbRow& row, TaskSort sort);
// Parse the HTTP filters, throwing invalid_argument for a malformed query.
TaskListQuery parseTaskListQuery(const portus::Json& query);
}
