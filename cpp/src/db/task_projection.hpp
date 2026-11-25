#pragma once
#include <string>
#include "portus/json.hpp"

namespace actio {
enum class TaskProjection { summary, description, full };
// Select API field names and PostgreSQL values for the requested response shape.
std::string taskDocument(TaskProjection projection);
// Project an Actio task to the legacy Memoria response.
portus::Json memoriaTask(const portus::Json& task);
}
