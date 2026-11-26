#pragma once
#include <stdexcept>
#include "portus/json.hpp"

namespace actio {
// A rejected settings patch. issues lists one entry per invalid or unknown key.
class TeamSettingsError : public std::runtime_error {
public:
    // Keep the per-key issues so the route can return them with the 400 response.
    explicit TeamSettingsError(portus::Json issues)
        : std::runtime_error("Invalid settings"), issues(std::move(issues)) {}
    const portus::Json issues;
};

// Reject unknown keys and values outside the documented team settings schema.
void validateTeamSettingsPatch(const portus::Json& patch);
// Overlay a valid patch on stored settings, drop unknown stored keys and fill defaults.
// Throws TeamSettingsError for an invalid patch and std::runtime_error for invalid stored values.
portus::Json mergeTeamSettings(const portus::Json& stored, const portus::Json& patch);
}
