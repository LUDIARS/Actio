#pragma once
#include <memory>
#include "portus/db.hpp"
#include "portus/http.hpp"

namespace actio {
// Register the direct-loopback Concordia HTTP surface.
void addConcordiaReadRoutes(portus::HttpServerOptions& options, bool localMode,
                            std::shared_ptr<portus::DbPool> pool);
}
