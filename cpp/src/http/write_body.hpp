#pragma once
#include "portus/json.hpp"

namespace actio {
// Parse a bounded UTF-8 JSON object before obtaining a database lease.
portus::Json parseWriteBody(std::string_view body);
}
