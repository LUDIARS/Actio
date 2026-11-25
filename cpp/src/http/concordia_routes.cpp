#include "actio/concordia_routes.hpp"
#include <atomic>
#include <chrono>
#include <string_view>
#include "actio/local_access.hpp"
#include "actio/local_owner.hpp"
#include "concordia_catalog.hpp"

namespace actio {
namespace {
using Read = portus::Json (*)(portus::DbConnection&, portus::DbDeadline);
using Clock = std::chrono::steady_clock;
constexpr auto request_timeout = std::chrono::seconds(8);

portus::Reply privateJson(const portus::Json& body, int status = 200) {
    return portus::json(body, status, {{"Cache-Control", "no-store"}});
}

portus::Reply error(std::string_view message, int status) {
    return privateJson(portus::Json::object({{"error", message}}), status);
}

struct LocalReader {
    bool enabled;
    std::shared_ptr<portus::DbPool> pool;
    std::atomic<bool> ownerProvisioned{false};

    portus::Reply read(portus::RequestContext& request, Read operation,
                       std::string_view unauthenticated) {
        if (!enabled) return error(unauthenticated, 401);
        if (!allowsLocalOwner(request)) return error("local_access_required", 403);
        if (!pool) return error("Database unavailable", 503);
        try {
            // Profile reads stop needing a DB lease once the idempotent insert succeeds.
            const bool needsAnchor = !ownerProvisioned.load();
            if (!needsAnchor && !operation) return privateJson(localOwnerProfile());
            const auto deadline = Clock::now() + request_timeout;
            auto connection = pool->acquire(deadline);
            if (needsAnchor) {
                provisionLocalOwner(*connection, deadline);
                ownerProvisioned.store(true);
            }
            return privateJson(operation ? operation(*connection, deadline) : localOwnerProfile());
        } catch (const portus::DbTimeout&) {
            return error("Database unavailable", 503);
        } catch (const portus::DbDisconnected&) {
            return error("Database unavailable", 503);
        }
    }
};
}

void addConcordiaReadRoutes(portus::HttpServerOptions& options, bool localMode,
                            std::shared_ptr<portus::DbPool> pool) {
    auto reader = std::make_shared<LocalReader>(localMode, std::move(pool));
    options.routes.emplace_back("GET", "/api/auth/me", [reader](portus::RequestContext& request) {
        return reader->read(request, nullptr, "No token provided");
    });
    options.routes.emplace_back("GET", "/api/teams", [reader](portus::RequestContext& request) {
        return reader->read(request, listOwnerTeams, "Authentication required");
    });
    options.routes.emplace_back("GET", "/api/projects/cc", [reader](portus::RequestContext& request) {
        return reader->read(request, listCcProjects, "Authentication required");
    });
}
}
