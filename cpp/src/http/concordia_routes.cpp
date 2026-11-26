#include "actio/concordia_routes.hpp"
#include <atomic>
#include <chrono>
#include <optional>
#include <string_view>
#include "actio/local_access.hpp"
#include "actio/local_owner.hpp"
#include "concordia_catalog.hpp"
#include "pm_critical_path.hpp"
#include "pm_project_read.hpp"
#include "sprint_write.hpp"
#include "task_categories.hpp"
#include "task_critical_path.hpp"
#include "task_delete.hpp"
#include "task_read.hpp"
#include "task_write.hpp"
#include "team_admin.hpp"
#include "team_settings.hpp"
#include "write_body.hpp"
#include "write_input.hpp"

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

struct LocalRoutes {
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

    portus::Reply criticalPath(const portus::RequestContext& request) {
        const auto& team = request.params.at("teamId").as_string();
        if (team.empty() || team.contains('\0')) return error("teamId is required", 400);
        if (!enabled) return error("Forbidden", 403);
        const auto access = authorize(request, "Forbidden");
        if (access.status != 204) return access;
        return run([&team](portus::DbConnection& connection, portus::DbDeadline deadline) {
            if (!taskTeamExists(connection, deadline, team)) return error("Forbidden", 403);
            return privateJson(readTeamCriticalPath(connection, deadline, team));
        });
    }

    using ProjectRead = portus::Json (*)(portus::DbConnection&, portus::DbDeadline, std::string_view);

    portus::Reply pmProject(const portus::RequestContext& request, ProjectRead operation) {
        const auto access = authorize(request, "Authentication required");
        if (access.status != 204) return access;
        const auto& id = request.params.at("id").as_string();
        if (id.empty() || id.contains('\0')) return error("Project not found", 404);
        return run([&](portus::DbConnection& connection, portus::DbDeadline deadline) {
            const auto result = operation(connection, deadline, id);
            return result.is_null() ? error("Project not found", 404) : privateJson(result);
        });
    }

    portus::Reply removeTask(const portus::RequestContext& request) {
        const auto access = authorize(request, "Authentication required");
        if (access.status != 204) return access;
        try {
            const auto& id = request.params.at("id").as_string();
            return run([&id](portus::DbConnection& connection, portus::DbDeadline deadline) {
                return privateJson(deleteTask(connection, deadline, id));
            });
        } catch (const WriteError& invalid) {
            return error(invalid.what(), invalid.status);
        }
    }

    portus::Reply removeCategory(const portus::RequestContext& request) {
        const auto access = authorize(request, "Authentication required");
        if (access.status != 204) return access;
        try {
            const auto& name = request.params.at("name").as_string();
            return run([&name](portus::DbConnection& connection, portus::DbDeadline deadline) {
                return privateJson(unregisterTaskCategory(connection, deadline, name));
            });
        } catch (const WriteError& invalid) {
            return error(invalid.what(), invalid.status);
        }
    }

    using TeamRead = portus::Json (*)(portus::DbConnection&, portus::DbDeadline, std::string_view);

    // Team role routes answer 403 for every caller that does not hold the team, as Node does.
    portus::Reply teamRead(const portus::RequestContext& request, TeamRead operation) {
        if (!enabled) return error("Forbidden", 403);
        const auto access = authorize(request, "Forbidden");
        if (access.status != 204) return access;
        const auto& team = request.params.at("teamId").as_string();
        return run([&](portus::DbConnection& connection, portus::DbDeadline deadline) {
            const auto result = operation(connection, deadline, team);
            return result.is_null() ? error("Forbidden", 403) : privateJson(result);
        });
    }

    // The local owner may administer memberships without holding any team, as Node allows.
    portus::Reply memberships(const portus::RequestContext& request) {
        if (!enabled) return error("Forbidden", 403);
        const auto access = authorize(request, "Forbidden");
        if (access.status != 204) return access;
        const auto& user = request.params.at("userId").as_string();
        return run([&user](portus::DbConnection& connection, portus::DbDeadline deadline) {
            return privateJson(listUserMemberships(connection, deadline, user));
        });
    }

    portus::Reply patchSettings(const portus::RequestContext& request) {
        if (!enabled) return error("Forbidden", 403);
        const auto access = authorize(request, "Forbidden");
        if (access.status != 204) return access;
        const auto& team = request.params.at("teamId").as_string();
        std::optional<std::pair<std::string, int>> invalidBody;
        portus::Json patch;
        try {
            patch = parseWriteBody(request.body);
        } catch (const WriteError& invalid) {
            invalidBody.emplace(invalid.what(), invalid.status);
        }
        return run([&](portus::DbConnection& connection, portus::DbDeadline deadline) {
            // Node checks the team role before it reads the body.
            if (team.contains('\0') || !taskTeamExists(connection, deadline, team)) return error("Forbidden", 403);
            if (invalidBody) return error(invalidBody->first, invalidBody->second);
            try {
                validateTeamSettingsPatch(patch);
                return privateJson(patchTeamSettings(connection, deadline, team, patch));
            } catch (const TeamSettingsError& invalid) {
                return privateJson(portus::Json::object({{"error", invalid.what()}, {"issues", invalid.issues}}), 400);
            } catch (const WriteError& invalid) {
                return error(invalid.what(), invalid.status);
            }
        });
    }

    portus::Reply putMember(const portus::RequestContext& request) {
        if (!enabled) return error("Forbidden", 403);
        const auto access = authorize(request, "Forbidden");
        if (access.status != 204) return access;
        try {
            portus::Json input;
            try {
                input = parseWriteBody(request.body);
            } catch (const WriteError& invalid) {
                // Node reads an unparsable or non-object body as a missing role.
                if (invalid.status != 400) throw;
                throw WriteError("role is required");
            }
            teamMemberRole(input);
            const auto& team = request.params.at("teamId").as_string();
            const auto& user = request.params.at("userId").as_string();
            return run([&](portus::DbConnection& connection, portus::DbDeadline deadline) {
                return privateJson(putTeamMember(connection, deadline, team, user, input));
            });
        } catch (const WriteError& invalid) {
            return error(invalid.what(), invalid.status);
        }
    }

    portus::Reply deleteMember(const portus::RequestContext& request) {
        if (!enabled) return error("Forbidden", 403);
        const auto access = authorize(request, "Forbidden");
        if (access.status != 204) return access;
        const auto& team = request.params.at("teamId").as_string();
        const auto& user = request.params.at("userId").as_string();
        try {
            return run([&](portus::DbConnection& connection, portus::DbDeadline deadline) {
                return privateJson(removeTeamMember(connection, deadline, team, user));
            });
        } catch (const WriteError& invalid) {
            return error(invalid.what(), invalid.status);
        }
    }

    template<class Operation>
    portus::Reply write(const portus::RequestContext& request, std::string_view unauthenticated,
                        Operation operation) {
        const auto access = authorize(request, unauthenticated);
        if (access.status != 204) return access;
        try {
            const auto input = parseWriteBody(request.body);
            return run([&](portus::DbConnection& connection, portus::DbDeadline deadline) {
                return operation(connection, deadline, input);
            });
        } catch (const WriteError& invalid) {
            return error(invalid.what(), invalid.status);
        }
    }
};

// Team membership, settings and project routes used by the front end's team administration.
void addTeamAdminRoutes(portus::HttpServerOptions& options, const std::shared_ptr<LocalRoutes>& routes) {
    using Request = portus::RequestContext;
    options.routes.emplace_back("GET", "/api/teams/memberships/{userId}",
        [routes](Request& request) { return routes->memberships(request); });
    options.routes.emplace_back("GET", "/api/teams/{teamId}/members",
        [routes](Request& request) { return routes->teamRead(request, listTeamMembers); });
    options.routes.emplace_back("PUT", "/api/teams/{teamId}/members/{userId}",
        [routes](Request& request) { return routes->putMember(request); });
    options.routes.emplace_back("DELETE", "/api/teams/{teamId}/members/{userId}",
        [routes](Request& request) { return routes->deleteMember(request); });
    options.routes.emplace_back("GET", "/api/teams/{teamId}/settings",
        [routes](Request& request) { return routes->teamRead(request, readTeamSettings); });
    options.routes.emplace_back("PATCH", "/api/teams/{teamId}/settings",
        [routes](Request& request) { return routes->patchSettings(request); });
    options.routes.emplace_back("GET", "/api/teams/{teamId}/projects",
        [routes](Request& request) { return routes->teamRead(request, listTeamProjects); });
}
}

void addConcordiaReadRoutes(portus::HttpServerOptions& options, bool localMode,
                            std::shared_ptr<portus::DbPool> pool) {
    auto reader = std::make_shared<LocalRoutes>(localMode, std::move(pool));
    options.routes.emplace_back("GET", "/api/auth/me", [reader](portus::RequestContext& request) {
        return reader->read(request, nullptr, "No token provided");
    });
    options.routes.emplace_back("GET", "/api/teams", [reader](portus::RequestContext& request) {
        return reader->read(request, listOwnerTeams, "Authentication required");
    });
    addTeamAdminRoutes(options, reader);
    options.routes.emplace_back("GET", "/api/projects/cc",[reader](portus::RequestContext& request) {
        return reader->read(request, listCcProjects, "Authentication required");
    });
    options.routes.emplace_back("GET", "/api/pm/projects", [reader](portus::RequestContext& request) {
        return reader->read(request, listPmProjects, "Authentication required");
    });
    options.routes.emplace_back("GET", "/api/pm/projects/{id}", [reader](portus::RequestContext& request) {
        return reader->pmProject(request, readPmProject);
    });
    options.routes.emplace_back("GET", "/api/pm/projects/{id}/analytics/critical-path",
        [reader](portus::RequestContext& request) { return reader->pmProject(request, readPmCriticalPath); });
    options.routes.emplace_back("GET", "/api/teams/{teamId}/critical-path", [reader](portus::RequestContext& request) {
        return reader->criticalPath(request);
    });
    options.routes.emplace_back("GET", "/api/tasks", [reader](portus::RequestContext& request) {
        return reader->list(request);
    });
    options.routes.emplace_back("GET", "/api/tasks/categories", [reader](portus::RequestContext& request) {
        return reader->read(request, readTaskCategories, "Authentication required");
    });
    options.routes.emplace_back("POST", "/api/tasks/categories", [reader](portus::RequestContext& request) {
        return reader->write(request, "Authentication required", [](auto& connection, auto deadline, const auto& input) {
            return privateJson(registerTaskCategory(connection, deadline, input), 201);
        });
    });
    options.routes.emplace_back("DELETE", "/api/tasks/categories/{name}", [reader](portus::RequestContext& request) {
        return reader->removeCategory(request);
    });
    options.routes.emplace_back("GET", "/api/tasks/{id}", [reader](portus::RequestContext& request) {
        return reader->detail(request);
    });
    options.routes.emplace_back("DELETE", "/api/tasks/{id}", [reader](portus::RequestContext& request) {
        return reader->removeTask(request);
    });
    options.routes.emplace_back("POST", "/api/tasks", [reader](portus::RequestContext& request) {
        return reader->write(request, "Authentication required", [](auto& connection, auto deadline, const auto& input) {
            auto result = createTask(connection, deadline, input);
            return privateJson(portus::Json::object({{"task", std::move(result.task)}}), result.created ? 201 : 200);
        });
    });
    options.routes.emplace_back("PATCH", "/api/tasks/{id}", [reader](portus::RequestContext& request) {
        return reader->write(request, "Authentication required", [&](auto& connection, auto deadline, const auto& input) {
            const auto& id = request.params.at("id").as_string();
            if (id.empty() || id.contains('\0')) throw WriteError("Task not found", 404);
            return privateJson(portus::Json::object({{"task", patchTask(connection, deadline, id, input)}}));
        });
    });
    options.routes.emplace_back("PATCH", "/api/tasks/{id}/lane", [reader](portus::RequestContext& request) {
        return reader->write(request, "Authentication required", [&](auto& connection, auto deadline, const auto& input) {
            const auto& id = request.params.at("id").as_string();
            return privateJson(portus::Json::object({{"task", changeTaskLane(connection, deadline, id, input)}}));
        });
    });
    options.routes.emplace_back("POST", "/api/teams/{teamId}/planning/sprints", [reader](portus::RequestContext& request) {
        return reader->write(request, "Forbidden", [&](auto& connection, auto deadline, const auto& input) {
            const auto& team = request.params.at("teamId").as_string();
            if (team.empty() || team.contains('\0')) throw WriteError("teamId is required");
            return privateJson(portus::Json::object({{"sprint", createSprint(connection, deadline, team, input)}}), 201);
        });
    });
    options.routes.emplace_back("PATCH", "/api/teams/{teamId}/planning/sprints/{id}", [reader](portus::RequestContext& request) {
        return reader->write(request, "Forbidden", [&](auto& connection, auto deadline, const auto& input) {
            const auto& team = request.params.at("teamId").as_string();
            const auto& id = request.params.at("id").as_string();
            if (team.empty() || team.contains('\0')) throw WriteError("teamId is required");
            if (id.empty() || id.contains('\0')) throw WriteError("スプリントが見つかりません", 404);
            return privateJson(portus::Json::object({{"sprint", changeSprint(connection, deadline, team, id, input)}}));
        });
    });
}
}
