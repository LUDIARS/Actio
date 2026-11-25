#include <cstdio>
#include <stdexcept>
#include "actio/concordia_routes.hpp"
#include "actio/timetable.hpp"

namespace {
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct FixturePool final : portus::DbPool {
    int acquired = 0;
    int commits = 0;
    int rollbacks = 0;
    int deletes = 0;
    int refreshes = 0;

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& pool) : pool_(pool) {}
        void begin(portus::DbDeadline) override {
            require(!transaction_, "nested transaction");
            transaction_ = true;
        }
        void commit(portus::DbDeadline) override {
            require(transaction_, "commit without a transaction");
            transaction_ = false;
            ++pool_.commits;
        }
        void rollback(portus::DbDeadline) override {
            require(transaction_, "rollback without a transaction");
            transaction_ = false;
            ++pool_.rollbacks;
        }

    private:
        FixturePool& pool_;
        bool transaction_ = false;

        void lockedTask(const portus::DbQuery& query, portus::DbResult& result) const {
            require(transaction_ && query.sql.contains("FOR UPDATE"), "task must be locked");
            const auto id = query.params.at(0);
            if (id == "owned") result.append({"actio-local", std::nullopt, "team-1"});
            if (id == "sprint") result.append({"actio-local", "sprint-1", "team-1"});
            if (id == "other") result.append({"user-2", std::nullopt, "team-1"});
        }

        bool handleTaskQuery(const portus::DbQuery& query, portus::DbResult& result) {
            if (query.sql.starts_with("LOCK TABLE tasks")) {
                require(transaction_, "write lock outside a transaction");
            } else if (query.sql.contains("SELECT owner_id, sprint_id, team_id")) {
                lockedTask(query, result);
            } else if (query.sql.starts_with("DELETE FROM tasks")) {
                require(transaction_ && query.params.at(0) == "owned", "unexpected deleted task");
                ++pool_.deletes;
            } else if (query.sql.contains("pg_advisory_xact_lock")) {
                require(transaction_ && pool_.commits == 1 && query.params.at(0) == "actio-critical-path:team-1",
                    "team refresh must follow the delete commit");
                ++pool_.refreshes;
            } else if (query.sql.contains("FROM tasks AS t") || query.sql.contains("WITH computed AS")) {
                require(transaction_, "team refresh outside its transaction");
            } else {
                return false;
            }
            return true;
        }

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline, portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "missing query deadline");
            if (query.sql.starts_with("INSERT INTO users") || handleTaskQuery(query, result)) return;
            if (query.sql.contains("FROM pm_projects")) {
                require(query.sql.contains("source_config - 'token'") && query.sql.contains("'hasToken'"),
                    "PM SQL must only project public config");
                if (query.params.empty() || query.params.at(0) == "pm-1") {
                    result.append({R"({"id":"pm-1","name":"PM","sourceConfig":{"owner":"org","hasToken":true}})"});
                }
            } else if (query.sql.contains("FROM pm_tasks")) {
                if (query.params.at(0) == "pm-1") {
                    result.append({"a", "First", "closed", "8", "[]", "[]"});
                    result.append({"b", "Second", "open", "16", R"(["user-1"])", R"(["a"])"});
                    result.append({"c", "Independent", "open", "12", "[]", R"(["outside-project"])"});
                    result.append({"cycle", "Cycle", "open", "8", "[]", R"(["cycle"])"});
                }
            } else {
                throw std::logic_error("unexpected query");
            }
        }
    };

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        ++acquired;
        return std::make_unique<Connection>(*this);
    }
};

portus::Reply request(const portus::Router& router, const char* method, const char* path, bool forwarded = false) {
    const auto route = router.match(method, path);
    require(route.has_value(), "route missing");
    portus::RequestContext request;
    request.method = method;
    request.path = path;
    request.params = route->params;
    request.query = route->query;
    request.remote_addr = "127.0.0.1";
    request.headers.add("Host", "127.0.0.1:17880");
    if (forwarded) request.headers.add("X-Forwarded-For", "127.0.0.1");
    return route->def->handler(request);
}

void checkDelete(const portus::Router& router, const FixturePool& pool) {
    require(request(router, "DELETE", "/api/tasks/owned", true).status == 403 && pool.acquired == 0,
        "forwarded delete reached the DB");
    require(request(router, "DELETE", "/api/tasks/missing").status == 404, "missing task was accepted");
    require(request(router, "DELETE", "/api/tasks/other").status == 403, "another owner's task was accepted");
    require(request(router, "DELETE", "/api/tasks/sprint").status == 409, "sprint task was accepted");
    require(pool.deletes == 0 && pool.rollbacks == 3 && pool.commits == 0, "rejected delete changed the DB");
    const auto deleted = request(router, "DELETE", "/api/tasks/owned");
    require(deleted.status == 200 && portus::Json::parse(deleted.body).at("ok").as_bool()
        && pool.deletes == 1 && pool.refreshes == 1 && pool.commits == 2, "wrong delete result or side effect");
}

void checkPm(const portus::Router& router) {
    const auto list = request(router, "GET", "/api/pm/projects");
    const auto body = portus::Json::parse(list.body);
    const auto& config = body.at("projects").items().at(0).at("sourceConfig");
    require(list.status == 200 && !config.find("token") && config.at("hasToken").as_bool(),
        "wrong public config");
    const auto detail = request(router, "GET", "/api/pm/projects/pm-1");
    require(detail.status == 200 && portus::Json::parse(detail.body).at("id") == "pm-1",
        "wrong project detail");
    require(request(router, "GET", "/api/pm/projects/missing").status == 404, "missing PM project was accepted");
    const auto critical = request(router, "GET", "/api/pm/projects/pm-1/analytics/critical-path");
    const auto report = portus::Json::parse(critical.body);
    const auto& path = report.at("path").items();
    require(critical.status == 200 && path.size() == 2 && path.at(0).at("taskId") == "a"
        && path.at(1).at("taskId") == "b" && path.at(1).at("assignee") == "user-1"
        && report.at("totalEstimatedDays") == portus::Json(3) && report.at("riskLevel") == "low",
        "wrong PM critical path");
    const auto empty = request(router, "GET", "/api/pm/projects/empty/analytics/critical-path");
    require(empty.status == 200 && portus::Json::parse(empty.body).at("path") == portus::Json::array(),
        "wrong empty PM critical path");
}

void checkTimetable(const portus::Router& router, const FixturePool& pool) {
    const auto reply = request(router, "GET", "/api/timetable");
    const auto timetable = portus::Json::parse(reply.body);
    const auto& days = timetable.at("days").items();
    const auto& periods = timetable.at("periods").items();
    require(reply.status == 200 && days.size() == 7 && days.front() == "\xe6\x9c\x88" && days.back() == "\xe6\x97\xa5"
        && periods.size() == 11 && periods.front().at("start") == "09:30" && periods.back().at("end") == "20:30"
        && pool.acquired == 0, "wrong timetable or unexpected DB access");
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    actio::addTimetableRoute(options);
    const portus::Router router(std::move(options.routes));
    checkTimetable(router, *pool);
    checkDelete(router, *pool);
    checkPm(router);
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
