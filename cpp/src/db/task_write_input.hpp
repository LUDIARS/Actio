#pragma once
#include "portus/json.hpp"

namespace actio {
// Normalize writable fields while retaining the distinction between omission and null.
portus::Json taskChanges(const portus::Json& input, const portus::Json& current);
}
