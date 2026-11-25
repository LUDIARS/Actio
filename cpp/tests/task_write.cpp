#include "actio/concordia_routes.hpp"
#include <cstdio>
#include <stdexcept>

namespace {
using portus::Json;
constexpr auto task = R"({"id":"task-1","ownerId":"actio-local","title":"run","status":"open","requirements":"evidence","pluginPayload":null,"updatedAt":"2026-11-25T20:00:00.000Z"})";
constexpr auto done = R"({"id":"task-1","ownerId":"actio-local","title":"run","status":"done","requirements":"evidence","pluginPayload":null,"updatedAt":"2026-11-25T20:00:01.000Z"})";
constexpr auto plan = R"({"id":"s-1","teamId":"t-1","status":"planning","revision":0,"startsOn":"2026-11-25","endsOn":"2026-11-30","bufferEndsOn":"2026-12-02"})";
constexpr auto revised = R"({"id":"s-1","teamId":"t-1","status":"planning","revision":1,"startsOn":"2026-11-25","endsOn":"2026-12-01","bufferEndsOn":"2026-12-02"})";

void require(bool condition, const char* why) {
    if (!condition) throw std::runtime_error(why);
}

struct Pool final : portus::DbPool {
    bool duplicate = false;
    bool failAudit = false;
    bool active = false;
    unsigned leases = 0;
    unsigned commits = 0;
    unsigned rollbacks = 0;
    unsigned notifications = 0;
    unsigned audit = 0;

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(Pool& owner) : pool(owner) {}
        void begin(portus::DbDeadline) override {
            require(!pool.active, "nested transaction");
            pool.active = true;
        }
        void commit(portus::DbDeadline) override {
            require(pool.active, "commit without transaction");
            pool.active = false;
            ++pool.commits;
        }
        void rollback(portus::DbDeadline) override {
            require(pool.active, "rollback without transaction");
            pool.active = false;
            ++pool.rollbacks;
        }

    private:
        Pool& pool;

        void execute(const portus::DbQuery& q, portus::DbDeadline deadline,
                     portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "missing DB deadline");
            if (q.sql.starts_with("INSERT INTO users")) return;
            if (q.sql.contains("INSERT INTO task_notifications")) {
                require(!pool.active && q.params.at(3) == "task.completed"
                    && q.params.at(4) == "memoria" && q.params.at(5) == "task.completed:task-1:2026-11-25T20:00:01.000Z",
                    "notification route or deduplication changed");
                ++pool.notifications;
                return;
            }
            require(pool.active, "mutation query outside transaction");
            if (q.sql == "LOCK TABLE tasks IN ROW EXCLUSIVE MODE") return;
            if (q.sql.starts_with("INSERT INTO tasks")) {
                const auto data = Json::parse(q.params.at(0).value());
                require(q.sql.contains("ON CONFLICT(source, source_ref)") && q.params.at(2) == "actio-local"
                    && data.at("description") == "description" && data.at("status") == "open"
                    && data.at("source_ref") == "req:44", "create identity, aliases or idempotency changed");
                if (!pool.duplicate) result.append({task});
            } else if (q.sql.contains("WHERE source = $1")) {
                require(pool.duplicate && q.params.at(1) == "req:44", "retry loaded wrong source");
                result.append({task});
            } else if (q.sql.contains("FROM tasks WHERE id = $1 FOR UPDATE")) {
                if (q.params.front() == "task-1") result.append({task});
                if (q.params.front() == "foreign")
                    result.append({R"({"id":"foreign","ownerId":"other","teamId":"t-1"})"});
            } else if (q.sql.starts_with("WITH changed AS (UPDATE tasks")) {
                require(q.sql.contains("completed_at = CASE") && q.params.at(1) == "task-1"
                    && Json::parse(q.params.at(0).value()).at("status") == "done", "status completion changed");
                result.append({done});
            } else if (q.sql.contains("pg_advisory_xact_lock")) {
                require(q.params.front() == "actio-planning:t-1", "planning lock diverges from Node");
                result.append({""});
            } else if (q.sql.contains("FROM team_refs")) {
                if (q.params.front() == "t-1") result.append({"1"});
            } else if (q.sql.contains("starts_on <= $3")) {
                require(q.params.front() == "t-1", "overlap check escaped team");
            } else if (q.sql.contains("INSERT INTO sprints")) {
                require(q.params.at(2) == "First plan" && q.params.at(9) == "actio-local", "sprint defaults changed");
                result.append({plan});
            } else if (q.sql.contains("FROM sprints WHERE team_id = $1 AND id = $2 FOR UPDATE")) {
                require(q.params.at(0) == "t-1" && q.params.at(1) == "s-1", "sprint lookup escaped team");
                result.append({plan});
            } else if (q.sql.starts_with("UPDATE sprints SET ends_on")) {
                require(q.params.front() == "2026-12-01", "wrong extension");
            } else if (q.sql.contains("SELECT sprint_id, status, assignee_id FROM tasks")) {
                require(q.params.at(0) == "task-1" && q.params.at(1) == "t-1"
                    && q.sql.contains("lane = 'backlog' FOR UPDATE"), "assignment escaped backlog or row lock");
                result.append({std::nullopt, "open", "actio-local"});
            } else if (q.sql.starts_with("UPDATE tasks SET sprint_id")) {
                require(q.params.at(0) == "s-1" && q.params.at(1) == "task-1", "wrong task assigned");
            } else if (q.sql.starts_with("UPDATE sprints SET revision")) {
                result.append({revised});
            } else if (q.sql.contains("INSERT INTO sprint_changes")) {
                require(q.params.at(3) == "actio-local", "audit actor changed");
                if (q.params.at(2) == "extend")
                    require(Json::parse(q.params.at(6).value()).at("sprint").at("revision") == 1,
                            "audit lacks new revision");
                if (pool.failAudit) throw std::runtime_error("audit unavailable");
                ++pool.audit;
            } else {
                throw std::logic_error("unexpected query");
            }
        }
    };

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        ++leases;
        return std::make_unique<Connection>(*this);
    }
};

portus::Reply send(const portus::Router& router, std::string_view method, std::string_view path,
                   std::string_view body, bool direct = true) {
    const auto match = router.match(method, path);
    require(match.has_value(), "write route missing");
    portus::RequestContext request;
    request.method = method;
    request.path = path;
    request.body = body;
    request.remote_addr = "127.0.0.1";
    request.headers.add("host", "localhost:17880");
    if (!direct) request.headers.add("x-forwarded-for", "127.0.0.1");
    request.params = match->params;
    return match->def->handler(request);
}

void checkTaskWrites(const portus::Router& router, Pool& pool) {
    constexpr auto payload = R"({"title":"run","status":"todo","details":"description","requirements":"evidence","source":"cc-command","source_ref":"req:44"})";
    require(send(router, "POST", "/api/tasks", payload, false).status == 403 && pool.leases == 0,
            "forwarded write acquired DB");
    require(send(router, "POST", "/api/tasks", R"({"title":"\u0000"})").status == 400 && pool.leases == 0,
            "invalid body acquired DB");
    const auto created = send(router, "POST", "/api/tasks", payload);
    require(created.status == 201 && Json::parse(created.body).at("task").at("requirements") == "evidence",
            "create response lost full task");
    pool.duplicate = true;
    require(send(router, "POST", "/api/tasks", payload).status == 200, "idempotent retry changed status");
    require(send(router, "PATCH", "/api/tasks/foreign", R"({"status":"done"})").status == 403,
            "local owner edited another assignee's task");
    require(send(router, "PATCH", "/api/tasks/missing", R"({"status":"done"})").status == 404,
            "missing task status changed");
    require(send(router, "PATCH", "/api/tasks/task-1", R"({"sprint_id":"s-1"})").status == 400,
            "generic task patch changed sprint membership");
    const auto updated = send(router, "PATCH", "/api/tasks/task-1", R"({"status":"done"})");
    require(updated.status == 200 && Json::parse(updated.body).at("task").at("status") == "done"
        && pool.notifications == 1 && pool.rollbacks == 3, "patch response, outbox, or rollback changed");
}

void checkSprintWrites(const portus::Router& router, Pool& pool) {
    constexpr auto collection = "/api/teams/t-1/planning/sprints";
    constexpr auto item = "/api/teams/t-1/planning/sprints/s-1";
    constexpr auto create = R"({"name":" First plan ","startsOn":"2026-11-25","endsOn":"2026-11-30","bufferEndsOn":"2026-12-02","cadenceDays":7})";
    constexpr auto extend = R"({"action":"extend","reason":"capacity","revision":0,"endsOn":"2026-12-01"})";
    require(send(router, "POST", collection, create).status == 201 && pool.audit == 1,
            "plan creation omitted audit");
    require(send(router, "PATCH", item, R"({"action":"extend","reason":"capacity","revision":1,"endsOn":"2026-12-01"})").status == 409,
            "stale revision accepted");
    require(send(router, "PATCH", item, R"({"action":"start","reason":"capacity","revision":0})").status == 409,
            "legacy start bypassed phase gate");
    const auto changed = send(router, "PATCH", item, extend);
    require(changed.status == 200 && Json::parse(changed.body).at("sprint").at("revision") == 1
        && pool.audit == 2, "plan extension lost revision or audit");
    const auto assigned = send(router, "PATCH", item,
        R"({"action":"assign","reason":"capacity","revision":0,"taskId":"task-1"})");
    require(assigned.status == 200 && pool.audit == 3, "local owner assignment lacked an audit row");
    const auto commits = pool.commits;
    pool.failAudit = true;
    bool failed = false;
    try {
        send(router, "PATCH", item, extend);
    } catch (const std::runtime_error&) {
        failed = true;
    }
    require(failed && !pool.active && pool.commits == commits && pool.rollbacks == 6,
            "audit failure committed an incomplete mutation");
}
}

int main() try {
    auto pool = std::make_shared<Pool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    checkTaskWrites(router, *pool);
    checkSprintWrites(router, *pool);
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
