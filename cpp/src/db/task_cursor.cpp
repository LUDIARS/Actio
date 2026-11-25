#include "task_list_query.hpp"
#include <cmath>
#include <cstdint>
#include "portus/crypto.hpp"

namespace actio {
namespace {
std::string_view sortName(TaskSort sort) {
    switch (sort) {
        case TaskSort::personal: return "personal";
        case TaskSort::priority: return "priority";
        case TaskSort::updated: return "default";
    }
    return "default";
}

bool timestamp(const portus::Json& value) {
    // Both the PostgreSQL and JavaScript date ranges must represent the key.
    constexpr double earliest = -210866803200000.0;
    constexpr double latest = 8640000000000000.0;
    const auto ms = value.as_number();
    return value.is_number() && ms >= earliest && ms <= latest;
}

// The legacy cursor contains only the fields needed to resume its selected sort.
bool validKey(const portus::Json& key, TaskSort sort) {
    const auto& id = key.at("id").as_string();
    if (key.at("v") != 1 || key.at("sort").as_string() != sortName(sort)
        || id.empty() || id.contains('\0')) return false;
    if (sort == TaskSort::updated) return timestamp(key.at("updatedAt"));
    const auto& rank = key.at("rank");
    if (!rank.is_number() || !std::isfinite(rank.as_number())) return false;
    if (sort == TaskSort::priority) {
        const auto value = rank.as_number();
        return value >= 0 && value <= 3 && std::trunc(value) == value;
    }
    const auto* due = key.find("deadline");
    return due && (due->is_null() || timestamp(*due)) && timestamp(key.at("createdAt"));
}
}

std::optional<portus::Json> decodeTaskCursor(std::string_view raw, TaskSort sort) {
    if (raw.empty() || raw.find_first_not_of(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") != std::string_view::npos)
        return std::nullopt;
    std::string decoded;
    if (!portus::base64_decode(raw, decoded)) return std::nullopt;
    try {
        auto key = portus::Json::parse(decoded, 4);
        if (validKey(key, sort)) return key;
    } catch (const portus::JsonError&) {
        return std::nullopt;
    }
    return std::nullopt;
}

// SQL returns the document followed by id, the millisecond timestamp keys and rank.
std::string encodeTaskCursor(const portus::DbRow& row, TaskSort sort) {
    auto key = portus::Json::object({{"v", 1}, {"sort", sortName(sort)}});
    if (sort == TaskSort::updated) {
        key.set("updatedAt", std::stoll(row.at(2).value()));
    } else {
        key.set("rank", std::stoi(row.at(5).value()));
        if (sort == TaskSort::personal) {
            const auto& deadline = row.at(4);
            key.set("deadline", deadline ? portus::Json(std::stoll(*deadline)) : portus::Json());
            key.set("createdAt", std::stoll(row.at(3).value()));
        }
    }
    key.set("id", row.at(1).value());
    return portus::base64url_encode(key.dump());
}
}
