#include "actio/concordia_routes.hpp"
#include <cstdio>
#include <stdexcept>
#include <string_view>
#include "portus/crypto.hpp"

namespace {
constexpr std::string_view defaultKey = R"({"v":1,"sort":"default","updatedAt":1760000000000,"id":"task-b"})";
constexpr std::string_view personalKey = R"({"v":1,"sort":"personal","rank":0,"deadline":null,"createdAt":1750000000000,"id":"task-b"})";
constexpr std::string_view priorityKey = R"({"v":1,"sort":"priority","rank":0,"id":"task-b"})";

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct FixturePool final : portus::DbPool {
    std::size_t calls = 0;
    bool timeout = false;
    std::string_view expectedSort;

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& owner) : owner_(owner) {}
        void begin(portus::DbDeadline) override { throw std::logic_error("unexpected begin"); }
        void commit(portus::DbDeadline) override { throw std::logic_error("unexpected commit"); }
        void rollback(portus::DbDeadline) override { throw std::logic_error("unexpected rollback"); }

    private:
        FixturePool& owner_;

        void checkContinuation(const portus::DbQuery& query) const {
            require(query.params.at(1) == "task-b", "cursor id was not bound");
            if (owner_.expectedSort == "personal") {
                require(query.sql.contains("deadline IS NOT DISTINCT FROM") && !query.params.at(3)
                    && query.params.at(4) == "1750000000000", "null deadline cursor changed");
            } else if (owner_.expectedSort == "priority") {
                require(query.sql.contains(", id) > (") && query.params.at(2) == "0", "priority cursor changed");
            } else {
                require(query.sql.contains("(updated_at, id) <") && query.params.at(2) == "1760000000000",
                    "default cursor changed");
            }
        }

        void page(const portus::DbQuery& query, portus::DbResult& result) const {
            require(query.max_rows == 2 && query.params.front() == "team-1" && query.params.back() == "2"
                && query.sql.find("team_id = $1") < query.sql.find(" ORDER BY ")
                && !query.sql.contains("'requirements', requirements"), "missing pre-page scope or limit");
            if (owner_.expectedSort == "personal")
                require(query.sql.contains("deadline ASC NULLS LAST"), "incorrect personal ordering");
            if (owner_.expectedSort == "priority")
                require(query.sql.contains("id ASC"), "incorrect priority ordering");
            if (query.params.size() > 2) {
                checkContinuation(query);
            } else {
                const bool withDescription = query.sql.contains("'description', description");
                const auto doc = withDescription ? R"({"id":"task-b","description":"body","pluginPayload":{"runs":[]}})"
                                                 : R"({"id":"task-b","pluginPayload":{"runs":[]}})";
                result.append({doc, "task-b", "1760000000000", "1750000000000", std::nullopt, "0"});
            }
            result.append({R"({"id":"task-a"})", "task-a", "1760000000000", "1750000000000", std::nullopt, "0"});
        }

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline,
                     portus::DbResult& result) override {
            ++owner_.calls;
            require(deadline > std::chrono::steady_clock::now(), "deadline missing");
            if (owner_.timeout) throw portus::DbTimeout("test");
            if (query.sql.starts_with("INSERT INTO users")) return;
            if (query.sql == "SELECT 1 FROM team_refs WHERE id = $1") {
                if (query.params.at(0) == "team-1") result.append({"1"});
                return;
            }
            if (query.sql.contains("FROM sprints")) {
                require(query.params.at(0) == "team-1", "sprint team missing");
                result.append({R"({"id":"s-1","teamId":"team-1","status":"active"})"});
                return;
            }
            if (query.sql.contains("FROM tasks WHERE id = $1")) {
                require(query.sql.contains("'requirements', requirements"), "detail omitted requirements");
                if (query.params.at(0) == "task-b")
                    result.append({R"({"id":"task-b","description":"body","requirements":"requirements","publicSummary":null})"});
                return;
            }
            if (query.sql.contains("sprint_id IS NULL AND status NOT IN")) {
                require(query.params.at(0) == "team-1" && query.params.at(1) == "s-1"
                    && query.sql.contains("'requirements', requirements"), "sprint view lost team or full projection");
                result.append({R"({"id":"task-b","sprintId":"s-1","requirements":"requirements"})"});
                return;
            }
            page(query, result);
        }
    };

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        return std::make_unique<Connection>(*this);
    }
};

portus::Reply get(const portus::Router& router, std::string_view path, bool direct = true) {
    auto match = router.match("GET", path);
    require(match.has_value(), "route missing");
    portus::RequestContext request;
    request.method = "GET";
    request.path = path.substr(0, path.find('?'));
    request.remote_addr = direct ? "127.0.0.1" : "192.0.2.1";
    request.headers.add("host", "127.0.0.1:17880");
    request.params = std::move(match->params);
    request.query = std::move(match->query);
    return match->def->handler(request);
}

void checkPages(const portus::Router& router, FixturePool& pool) {
    for (const auto& [sort, legacy] : {std::pair{std::string_view("default"), defaultKey},
                                      std::pair{std::string_view("personal"), personalKey},
                                      std::pair{std::string_view("priority"), priorityKey}}) {
        pool.expectedSort = sort;
        const auto path = "/api/tasks?limit=1&team_id=team-1&sort=" + std::string(sort);
        const auto first = get(router, path);
        require(first.status == 200, "first page failed");
        const auto page = portus::Json::parse(first.body);
        const auto& row = page.at("tasks").items().at(0);
        require(row.at("id") == "task-b" && row.at("pluginPayload").at("runs").is_array()
            && !row.find("description"), "summary shape changed");
        const auto token = portus::base64url_encode(legacy);
        require(page.at("nextCursor") == token, "cursor differs from old format");
        const auto last = get(router, path + "&cursor=" + token);
        const auto lastPage = portus::Json::parse(last.body);
        require(last.status == 200 && lastPage.at("tasks").items().at(0).at("id") == "task-a"
            && lastPage.at("nextCursor").is_null(), "last page changed");
    }
    const auto withBody = get(router, "/api/tasks?limit=1&team_id=team-1&include=description");
    require(withBody.status == 200 && portus::Json::parse(withBody.body).at("tasks").items().at(0).at("description") == "body",
        "explicit description was dropped");
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    require(get(router, "/api/tasks", false).status == 403 && pool->calls == 0, "remote task read touched DB");
    require(get(router, "/api/tasks?cursor=bad").status == 400 && pool->calls == 0, "invalid cursor touched DB");
    require(get(router, "/api/tasks?sort=priority&cursor=" + portus::base64url_encode(defaultKey)).status == 400,
        "sort-mismatched cursor accepted");
    require(get(router, "/api/tasks?limit=501").status == 400, "oversized page accepted");
    require(get(router, "/api/tasks?team_id=missing").status == 403, "unregistered team read accepted");
    checkPages(router, *pool);
    const auto sprint = get(router, "/api/tasks?team_id=team-1&view=current_sprint&limit=1");
    require(sprint.status == 200 && portus::Json::parse(sprint.body).at("current_sprint").at("id") == "s-1",
        "active sprint missing");
    const auto detail = get(router, "/api/tasks/task%2Db");
    require(detail.status == 200 && portus::Json::parse(detail.body).at("task").at("requirements") == "requirements",
        "detail did not return the full task");
    require(get(router, "/api/tasks/absent").status == 404, "missing task did not return 404");
    pool->timeout = true;
    const auto slow = get(router, "/api/tasks");
    require(slow.status == 503 && portus::Json::parse(slow.body).at("error") == "Task list temporarily unavailable",
        "list timeout differs from Node");
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
