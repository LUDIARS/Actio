#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/json.hpp"
#include "portus/util.hpp"

namespace actio::contracts {
inline const auto live_status = augur::post_only(
    [](const portus::Json& body, const std::string& version, std::int64_t epochMs) {
        return body.at("status").as_string() == "ok"
            && body.at("service").as_string() == "actio"
            && body.at("version").as_string() == version
            && body.at("timestamp").as_string() == portus::iso_time(epochMs);
    });
}
