#pragma once
#include <cstdint>
#include <string>
#include "portus/json.hpp"

namespace actio {
portus::Json liveStatus(const std::string& version, std::int64_t epochMs);
}
