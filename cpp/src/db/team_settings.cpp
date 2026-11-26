#include "team_settings.hpp"
#include <array>
#include <cmath>
#include <optional>
#include <string_view>
#include "augur/contract_runtime.hpp" /* augur-inject:import:e4f6d508 */
#include "../../contracts/team_settings_contract.hpp" /* augur-inject:contract-predicate:c0746db8 */

namespace actio {
namespace {
using portus::Json;
using Check = bool (*)(const Json&);

struct Field {
    std::string_view key;
    Check valid;
    std::string_view message;
    Json (*fallback)();
};

bool integral(const Json& value) {
    const auto n = value.as_number();
    return value.is_number() && std::isfinite(n) && std::trunc(n) == n;
}
bool positive(const Json& value) { return integral(value) && value.as_number() > 0; }
bool nonNegative(const Json& value) { return integral(value) && value.as_number() >= 0; }
bool notifyMinutes(const Json& value) { return positive(value) && value.as_number() <= 1440; }
bool ratio(const Json& value) {
    return value.is_number() && value.as_number() >= 0 && value.as_number() <= 1;
}
bool boolean(const Json& value) { return value.is_bool(); }
bool nonEmpty(const Json& value) { return value.is_string() && !value.as_string().empty(); }
bool inputMode(const Json& value) { return value == "minimal" || value == "full"; }
bool phase(const Json& value) {
    constexpr std::array phases{"concept", "prototype", "production", "polish", "release", "maintenance"};
    for (const auto* name : phases) {
        if (value == name) return true;
    }
    return false;
}
bool record(const Json& value) { return value.is_object(); }

// Matches the HH:MM pattern ^(?:[01]\d|2[0-3]):[0-5]\d$ used by the Node schema.
bool timeOfDay(const Json& value) {
    const auto& text = value.as_string();
    if (!value.is_string() || text.size() != 5 || text[2] != ':') return false;
    for (const auto index : {0, 1, 3, 4}) {
        if (text[index] < '0' || text[index] > '9') return false;
    }
    return (text[0] < '2' || text[1] <= '3') && text[0] <= '2' && text[3] <= '5';
}
bool timeList(const Json& value) {
    if (!value.is_array()) return false;
    for (const auto& item : value.items()) {
        if (!timeOfDay(item)) return false;
    }
    return true;
}
bool timeWindow(const Json& value) { return timeList(value) && value.items().size() == 2; }
bool definitionOfDone(const Json& value) {
    if (!value.is_array()) return false;
    for (const auto& item : value.items()) {
        if (!nonEmpty(item)) return false;
    }
    return true;
}

// Key order follows the Node schema so merged responses serialize in the same order.
const std::array<Field, 16> fields{{
    {"input_mode", inputMode, "must be minimal or full", [] { return Json("minimal"); }},
    {"default_daily_minutes", positive, "must be a positive integer", [] { return Json(120); }},
    {"notify_before_minutes", notifyMinutes, "must be a positive integer up to 1440", [] { return Json(60); }},
    {"sprint_length_days", positive, "must be a positive integer", [] { return Json(7); }},
    {"review_slots", timeList, "must be a list of HH:MM times", [] { return Json::array({"09:00", "18:00"}); }},
    {"completion_threshold", ratio, "must be a number from 0 to 1", [] { return Json(0.8); }},
    {"delay_grace_days", nonNegative, "must be a non-negative integer", [] { return Json(0); }},
    {"daily_stale_days", nonNegative, "must be a non-negative integer", [] { return Json(14); }},
    {"standup_enabled", boolean, "must be a boolean", [] { return Json(true); }},
    {"timezone", nonEmpty, "must be a non-empty string", [] { return Json("Asia/Tokyo"); }},
    {"wip_limit_per_member", positive, "must be a positive integer", [] { return Json(2); }},
    {"minutes_per_point", positive, "must be a positive integer", [] { return Json(60); }},
    {"work_window", timeWindow, "must be two HH:MM times", [] { return Json::array({"10:00", "23:00"}); }},
    {"dod", definitionOfDone, "must be a list of non-empty strings", [] { return Json::array(); }},
    {"phase", phase, "must be a known phase", [] { return Json("prototype"); }},
    {"phase_targets", record, "must be an object", [] { return Json::object(); }},
}};

const Field* findField(std::string_view key) {
    for (const auto& field : fields) {
        if (field.key == key) return &field;
    }
    return nullptr;
}

Json issue(std::string_view code, std::string_view key, std::string_view message) {
    return Json::object({{"code", code}, {"path", Json::array({key})}, {"message", message}});
}

// A submitted value wins over the stored one. Stored values are revalidated, as Node reparses them.
Json mergedValue(const Field& field, const Json& stored, const Json& patch) {
    const auto* submitted = patch.find(field.key);
    if (submitted) return *submitted;
    const auto* value = stored.is_object() ? stored.find(field.key) : nullptr;
    if (!value) return field.fallback();
    if (!field.valid(*value)) throw std::runtime_error("Stored team settings are invalid");
    return *value;
}
}

void validateTeamSettingsPatch(const Json& patch) {
    auto issues = Json::array();
    if (!patch.is_object()) issues.push_back(issue("invalid_type", "", "Expected object"));
    for (const auto& [key, value] : patch.members()) {
        const auto* field = findField(key);
        if (!field) issues.push_back(issue("unrecognized_keys", key, "Unrecognized key"));
        else if (!field->valid(value)) issues.push_back(issue("invalid_value", key, field->message));
    }
    if (!issues.items().empty()) throw TeamSettingsError(std::move(issues));
}

Json mergeTeamSettings(const Json& stored, const Json& patch) { return ::augur::invoke_observed(::augur::ContractSpec{"C-44", "1cf470ed", "src/db/team_settings.cpp:109"}, actio::contracts::team_settings, [&]() -> Json { /* augur-inject:contract-wrap:1cf470ed */
    validateTeamSettingsPatch(patch);
    Json::Object merged;
    merged.reserve(fields.size());
    for (const auto& field : fields) merged.emplace_back(std::string(field.key), mergedValue(field, stored, patch));
    return Json::from_members(std::move(merged));
}, stored, patch); /* augur-inject:contract-end:1cf470ed */ }
}
