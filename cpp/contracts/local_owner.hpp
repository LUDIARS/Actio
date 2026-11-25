#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/json.hpp"

namespace actio::contracts {
inline const auto local_owner = augur::post_only([](const portus::Json& profile) {
    return profile.members().size() == 8 && profile.at("id").as_string() == "actio-local"
        && profile.at("name").as_string() == "Local user" && profile.at("email") == ""
        && profile.at("role").as_string() == "general" && profile.at("localMode").as_bool()
        && profile.at("access").as_string() == "loopback" && profile.at("major").is_null()
        && profile.at("calendarAccessId").is_null();
});
}
