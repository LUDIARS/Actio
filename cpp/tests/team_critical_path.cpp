#include "actio/concordia_routes.hpp"
#include <cstdio>
#include <stdexcept>

namespace {
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

class GraphConnection final : public portus::DbConnection {
public:
    void begin(portus::DbDeadline) override { throw std::logic_error("unexpected transaction"); }
    void commit(portus::DbDeadline) override { throw std::logic_error("unexpected transaction"); }
    void rollback(portus::DbDeadline) override { throw std::logic_error("unexpected transaction"); }

private:
    void execute(const portus::DbQuery& query, portus::DbDeadline, portus::DbResult& result) override {
        if (query.sql.starts_with("INSERT INTO users")) return;
        const auto team = query.params.at(0);
        if (query.sql.starts_with("SELECT 1 FROM team_refs")) {
            if (team == "team" || team == "empty") result.append({"1"});
            return;
        }
        require(query.sql.starts_with("SELECT t.id, t.blocked_by")
            && query.params.size() == 1 && query.max_rows == portus::db_max_rows
            && query.sql.contains("t.team_id = $1 AND t.lane = 'backlog'")
            && query.sql.contains("NOT IN ('done', 'cancelled')")
            && !query.sql.contains("FOR UPDATE"), "graph read was not bounded and read-only");
        if (team == "empty") return;
        require(team == "team", "unknown team graph was queried");
        result.append({"b", R"(["a","foreign","cycle-1"])", "2", "estimate"});
        result.append({"cycle-2", R"(["cycle-1"])", "1", "default"});
        result.append({"short", "[]", "1", "default"});
        result.append({"cycle-1", R"(["cycle-2"])", "1", "default"});
        result.append({"a", "[]", "2.5", "duration_days"});
        result.append({"self", R"(["self"])", "1", "default"});
    }
};

struct FixturePool final : portus::DbPool {
    int leases = 0;
    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        ++leases;
        return std::make_unique<GraphConnection>();
    }
};

portus::Reply get(const portus::Router& router, std::string_view team, bool forwarded = false) {
    portus::RequestContext request;
    request.path = "/api/teams/" + std::string(team) + "/critical-path";
    request.remote_addr = "127.0.0.1";
    request.headers.add("Host", "127.0.0.1:17880");
    if (forwarded) request.headers.add("X-Forwarded-For", "127.0.0.1");
    const auto matched = router.match("GET", request.path);
    require(matched.has_value(), "route missing");
    request.params = matched->params;
    return matched->def->handler(request);
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    require(get(router, "team", true).status == 403 && pool->leases == 0, "proxy reached the database");
    require(get(router, "unknown").status == 403, "unknown team was authorized");
    const auto empty = get(router, "empty");
    require(empty.status == 200 && portus::Json::parse(empty.body)
        == portus::Json::parse(R"({"taskIds":[],"totalDays":0,"cycles":[],"tasks":[]})"), "wrong empty result");
    const auto reply = get(router, "team");
    require(reply.status == 200 && portus::Json::parse(reply.body) == portus::Json::parse(R"({
        "taskIds":["a","b"],"totalDays":4.5,"cycles":[["cycle-1","cycle-2"],["self"]],
        "tasks":[
            {"id":"a","slackDays":0,"earliestStart":0,"earliestFinish":2.5,"durationDays":2.5,"durationSource":"duration_days","isCriticalPath":true},
            {"id":"short","slackDays":3.5,"earliestStart":0,"earliestFinish":1,"durationDays":1,"durationSource":"default","isCriticalPath":false},
            {"id":"b","slackDays":0,"earliestStart":2.5,"earliestFinish":4.5,"durationDays":2,"durationSource":"estimate","isCriticalPath":true}
        ]
    })"), "critical path differs from the Node response");
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
