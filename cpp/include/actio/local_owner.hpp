#pragma once
#include "portus/db.hpp"
#include "portus/json.hpp"

namespace actio {
inline constexpr std::string_view local_owner_id = "actio-local";

// The profile for an admitted direct loopback owner.
portus::Json localOwnerProfile();
// Insert the fixed user anchor if either backend has yet to create it.
void provisionLocalOwner(portus::DbConnection& connection, portus::DbDeadline deadline);
}
