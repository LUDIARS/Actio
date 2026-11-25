#pragma once
#include "portus/json.hpp"

namespace actio {
// Apply defaults and validate the calendar bounds of a new sprint.
portus::Json newSprintInput(const portus::Json& input);
// Validate the fields specific to the requested sprint action.
portus::Json sprintChangeInput(const portus::Json& input);
}
