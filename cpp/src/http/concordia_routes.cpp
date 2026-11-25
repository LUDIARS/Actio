#include "actio/concordia_routes.hpp"
#include <atomic>
#include <chrono>
#include <string_view>
#include "actio/local_access.hpp"
#include "actio/local_owner.hpp"
#include "concordia_catalog.hpp"
#include "task_read.hpp"

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

    portus::Reply authorize(const portus::RequestContext& request,
                            std::string_view unauthenticated) const {
        if (!enabled) return error(unauthenticated, 401);
        if (!allowsLocalOwner(request)) return error("local_access_required", 403);
        return portus::Reply::no_content();
    }

    template<class Operation>
    portus::Reply run(Operation operation, std::string_view unavailable = "Database unavailable") {
        if (!pool) return error(unavailable, 503);
        try {
            const bool needsAnchor = !ownerProvisioned.load();
            const auto deadline = Clock::now() + request_timeout;
            auto connection = pool->acquire(deadline);
            if (needsAnchor) {
                provisionLocalOwner(*connection, deadline);
                ownerProvisioned.store(true);
            }
            return operation(*connection, deadline);
        } catch (const portus::DbTimeout&) {
            return error(unavailable, 503);
        } catch (const portus::DbDisconnected&) {
            return error(unavailable, 503);
        }
    }

    portus::Reply read(portus::RequestContext& request, Read operation,
                       std::string_view unauthenticated) {
        const auto access = authorize(request, unauthenticated);
        if (access.status != 204) return access;
        // Profile reads stop needing a DB lease once the idempotent insert succeeds.
        if (!operation && ownerProvisioned.load()) return privateJson(localOwnerProfile());
        return run([operation](portus::DbConnection& connection, portus::DbDeadline deadline) {
            return privateJson(operation ? operation(connection, deadline) : localOwnerProfile());
        });
    }

    portus::Reply list(const portus::RequestContext& request) {
        const auto access = authorize(request, "Authentication required");
        if (access.status != 204) return access;
        TaskListQuery input;
        try {
            input = parseTaskListQuery(request.query);
        } catch (const std::invalid_argument& invalid) {
            return error(invalid.what(), 400);
        }
        return run([&input](portus::DbConnection& connection, portus::DbDeadline deadline) {
            if (!input.team.empty() && !taskTeamExists(connection, deadline, input.team))
                return error("Forbidden", 403);
            return privateJson(input.currentSprint ? readCurrentSprintTasks(connection, deadline, input)
                                                   : readTaskPage(connection, deadline, input));
        }, "Task list temporarily unavailable");
    }

    portus::Reply detail(const portus::RequestContext& request) {
        const auto access = authorize(request, "Authentication required");
        if (access.status != 204) return access;
        const auto& id = request.params.at("id").as_string();
        if (id.empty() || id.contains('\0')) return error("Task not found", 404);
        return run([&id](portus::DbConnection& connection, portus::DbDeadline deadline) {
            auto task = readTaskDetail(connection, deadline, id);
            if (task.is_null()) return error("Task not found", 404);
            return privateJson(portus::Json::object({{"task", std::move(task)}}));
        });
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
    options.routes.emplace_back("GET", "/api/tasks", [reader](portus::RequestContext& request) {
        return reader->list(request);
    });
    options.routes.emplace_back("GET", "/api/tasks/{id}", [reader](portus::RequestContext& request) {
        return reader->detail(request);
    });
}
}
