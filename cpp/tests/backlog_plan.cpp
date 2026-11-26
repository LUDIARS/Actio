#include <cstdio>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include "actio/concordia_routes.hpp"

namespace {
using portus::Json;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

// Holds one team's sprint audit, backlog groups and placements, and checks the SQL each route sends.
struct FixturePool final : portus::DbPool {
    int acquired = 0;
    int writes = 0;
    std::set<std::string> groups{"g1"};
    std::set<std::string> backlog{"a", "b", "c"};
    std::map<std::string, std::string> groupOf{{"a", "g1"}, {"b", "g1"}};
    std::map<std::string, int> position;

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& pool) : pool_(pool) {}
        void begin(portus::DbDeadline) override { transaction_ = true; }
        void commit(portus::DbDeadline) override { close(); }
        void rollback(portus::DbDeadline) override { close(); }

    private:
        FixturePool& pool_;
        bool transaction_ = false;
        bool planLocked_ = false;
        bool rowsLocked_ = false;

        void close() {
            transaction_ = false;
            planLocked_ = false;
            rowsLocked_ = false;
        }

        void requirePlanLock() const { require(planLocked_, "planning write outside the team plan lock"); }

        // Answer the sprint lookup and its ordered audit rows.
        void sprintQuery(const portus::DbQuery& query, portus::DbResult& result) const {
            if (query.sql.starts_with("SELECT 1 FROM sprints")) {
                if (query.params.at(0) == "team" && query.params.at(1) == "s1") result.append({"1"});
                return;
            }
            require(query.sql.contains("ORDER BY created_at, event_order")
                && query.max_rows == portus::db_max_rows, "history must keep the audit order within the row cap");
            if (query.params.at(0) != "s1") return;
            result.append({"create", "actio-local", "初期計画", "{}", R"({"id":"s1"})", "2026-11-01T00:00:00.000Z"});
            result.append({"extend", "actio-local", "延長", R"({"id":"s1"})", R"({"sprint":{"id":"s1"}})",
                           "2026-11-02T00:00:00.000Z"});
        }

        // Apply group lookups, removal and placement detachment to the in-memory tables.
        void groupQuery(const portus::DbQuery& query, portus::DbResult& result) {
            requirePlanLock();
            const auto group = std::string(query.params.at(0).value());
            if (query.sql.starts_with("SELECT id FROM backlog_groups")) {
                if (pool_.groups.contains(group) && query.params.at(1) == "team") result.append({group});
                return;
            }
            if (query.sql.starts_with("UPDATE backlog_placements SET group_id = NULL")) {
                std::erase_if(pool_.groupOf, [&group](const auto& entry) {
                    return entry.second == group;
                });
            } else {
                require(query.sql.starts_with("DELETE FROM backlog_groups"), "unexpected group query");
                pool_.groups.erase(group);
            }
            ++pool_.writes;
        }

        // Count the locked backlog and the submitted IDs found in it.
        void backlogCount(const portus::DbQuery& query, portus::DbResult& result) const {
            require(planLocked_ && rowsLocked_ && query.sql.contains("FOR UPDATE"), "backlog read without locks");
            std::size_t matched = 0;
            for (const auto& id : Json::parse(query.params.at(1).value()).items())
                matched += pool_.backlog.contains(id.as_string()) ? 1 : 0;
            result.append({std::to_string(pool_.backlog.size()), std::to_string(matched)});
        }

        // Store the submitted order as positions.
        void placeOrder(const portus::DbQuery& query) {
            requirePlanLock();
            require(query.sql.contains("ON CONFLICT(task_id) DO UPDATE SET position"), "order must upsert positions");
            int index = 0;
            for (const auto& id : Json::parse(query.params.at(0).value()).items()) pool_.position[id.as_string()] = index++;
            ++pool_.writes;
        }

        void backlogQuery(const portus::DbQuery& query, portus::DbResult& result) {
            if (query.sql.contains("backlog_groups") || query.sql.contains("SET group_id")) groupQuery(query, result);
            else if (query.sql.contains("WITH locked AS")) backlogCount(query, result);
            else if (query.sql.contains("INSERT INTO backlog_placements")) placeOrder(query);
            else throw std::logic_error("unexpected backlog query");
        }

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline, portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "missing query deadline");
            if (query.sql.starts_with("INSERT INTO users")) return;
            if (query.sql == "SELECT 1 FROM team_refs WHERE id = $1") {
                if (query.params.at(0) == "team") result.append({"1"});
            } else if (query.sql.contains("pg_advisory_xact_lock")) {
                require(transaction_ && query.params.at(0) == "actio-planning:team", "wrong planning lock");
                planLocked_ = true;
                result.append({""});
            } else if (query.sql.starts_with("LOCK TABLE tasks")) {
                require(planLocked_, "task table locked before the plan");
                rowsLocked_ = true;
            } else if (query.sql.contains("sprint")) {
                sprintQuery(query, result);
            } else {
                backlogQuery(query, result);
            }
        }
    };

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        ++acquired;
        return std::make_unique<Connection>(*this);
    }
};

portus::Reply request(const portus::Router& router, const char* method, const char* path,
                      const char* body = "", bool forwarded = false) {
    const auto match = router.match(method, path);
    require(match.has_value(), "route missing");
    portus::RequestContext request;
    request.method = method;
    request.path = path;
    request.params = match->params;
    request.body = body;
    request.remote_addr = "127.0.0.1";
    request.headers.add("Host", "127.0.0.1:17880");
    if (forwarded) request.headers.add("X-Forwarded-For", "127.0.0.1");
    return match->def->handler(request);
}

Json body(const portus::Reply& reply) { return Json::parse(reply.body); }

void checkHistory(const portus::Router& router) {
    const auto history = request(router, "GET", "/api/teams/team/planning/sprints/s1/history");
    const auto changes = body(history).at("changes").items();
    require(history.status == 200 && changes.size() == 2 && changes.front().at("kind") == "create"
        && changes.front().at("beforeJson") == "{}" && changes.back().at("actorId") == "actio-local"
        && changes.back().at("createdAt") == "2026-11-02T00:00:00.000Z", "wrong sprint history");
    require(request(router, "GET", "/api/teams/missing/planning/sprints/s1/history").status == 403,
        "history of an unregistered team read");
    const auto missing = request(router, "GET", "/api/teams/team/planning/sprints/s9/history");
    require(missing.status == 404 && body(missing).at("error") == "スプリントが見つかりません", "missing sprint history read");
}

void checkUngroup(const portus::Router& router, FixturePool& pool) {
    require(request(router, "DELETE", "/api/teams/missing/planning/groups/g1").status == 403
        && pool.groups.contains("g1"), "group of an unregistered team removed");
    const auto missing = request(router, "DELETE", "/api/teams/team/planning/groups/g9");
    require(missing.status == 404 && body(missing).at("error") == "グループが見つかりません", "missing group removed");
    const auto removed = request(router, "DELETE", "/api/teams/team/planning/groups/g1");
    require(removed.status == 200 && body(removed).at("ok") == true && !pool.groups.contains("g1")
        && pool.groupOf.empty(), "group not removed or placements kept");
}

void checkOrder(const portus::Router& router, FixturePool& pool) {
    require(request(router, "PUT", "/api/teams/missing/planning/order", "not json").status == 403,
        "team role must be checked before the body");
    require(request(router, "PUT", "/api/teams/team/planning/order", "not json").status == 400, "invalid body accepted");
    for (const auto* invalid : {R"({})", R"({"taskIds":"a"})", R"({"taskIds":[""]})", R"({"taskIds":[1]})",
                                R"({"taskIds":["a"],"extra":1})"}) {
        require(request(router, "PUT", "/api/teams/team/planning/order", invalid).status == 400, "invalid order accepted");
    }
    const auto duplicate = request(router, "PUT", "/api/teams/team/planning/order", R"({"taskIds":["a","a","b"]})");
    require(duplicate.status == 400 && body(duplicate).at("error") == "タスクが重複しています", "duplicate order accepted");
    for (const auto* stale : {R"({"taskIds":["a","b"]})", R"({"taskIds":["a","b","x"]})",
                              R"({"taskIds":["a","b","c","x"]})"}) {
        const auto reply = request(router, "PUT", "/api/teams/team/planning/order", stale);
        require(reply.status == 409 && body(reply).at("error") == "バックログが変更されています。再読み込みしてください",
            "stale order accepted");
    }
    require(pool.position.empty(), "rejected orders wrote positions");
    const auto saved = request(router, "PUT", "/api/teams/team/planning/order", R"({"taskIds":["c","a","b"]})");
    require(saved.status == 200 && body(saved).at("ok") == true && pool.position.at("c") == 0
        && pool.position.at("a") == 1 && pool.position.at("b") == 2, "order not saved");
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    require(request(router, "GET", "/api/teams/team/planning/sprints/s1/history", "", true).status == 403
        && request(router, "PUT", "/api/teams/team/planning/order", R"({"taskIds":[]})", true).status == 403
        && pool->acquired == 0, "forwarded request reached the database");

    portus::HttpServerOptions disabledOptions;
    actio::addConcordiaReadRoutes(disabledOptions, false, pool);
    const portus::Router disabled(std::move(disabledOptions.routes));
    require(request(disabled, "DELETE", "/api/teams/team/planning/groups/g1").status == 403 && pool->acquired == 0,
        "planning without local mode reached the database");

    checkHistory(router);
    checkUngroup(router, *pool);
    checkOrder(router, *pool);
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
