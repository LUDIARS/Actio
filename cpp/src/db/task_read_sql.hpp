#pragma once
#include "task_list_query.hpp"

namespace actio {
// Own SQL bindings until the synchronous database call completes.
struct TaskReadSql {
    std::string text;
    std::vector<std::optional<std::string>> values;

    // Keep a bound value and return the corresponding PostgreSQL placeholder.
    std::string bind(std::optional<std::string> value);
    // Execute with borrowed parameter views into this query's owned text.
    std::vector<portus::DbRow> query(portus::DbConnection& connection, portus::DbDeadline deadline,
                                    std::size_t limit) const;
};

// Apply visibility and user filters before limiting the result.
void addTaskFilters(TaskReadSql& sql, const TaskListQuery& input);
// Restrict the result to keys strictly after the cursor.
void addTaskPageBound(TaskReadSql& sql, const TaskListQuery& input);
// Express the stable ordering for a paged selection.
std::string taskPageOrder(TaskSort sort);
// Select the key fields used to construct the continuation cursor.
std::string taskPageKeys(TaskSort sort);
}
