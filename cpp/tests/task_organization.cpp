#include <algorithm>
#include <cstdio>
#include <stdexcept>
#include "actio/concordia_routes.hpp"
#include "portus/util.hpp"

namespace {
using portus::Json;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct FixturePool final : portus::DbPool {
    int acquired = 0;
    int preferenceWrites = 0;
    int taskWrites = 0;
    std::string preference = R"(["Legacy",3,"Work"])";

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& pool) : pool_(pool) {}
        void begin(portus::DbDeadline) override {
            require(!transaction_, "nested transaction");
            transaction_ = true;
        }
        void commit(portus::DbDeadline) override { closeTransaction(); }
        void rollback(portus::DbDeadline) override { closeTransaction(); }

    private:
        FixturePool& pool_;
        bool transaction_ = false;
        bool ownerLocked_ = false;

        void closeTransaction() {
            require(transaction_, "no transaction");
            transaction_ = false;
            ownerLocked_ = false;
        }

        bool categoryQuery(const portus::DbQuery& query, portus::DbResult& result) {
            if (query.sql.starts_with("SELECT btrim")) {
                const auto name = portus::trim(query.params.at(0).value());
                result.append({name});
            } else if (query.sql.starts_with("SELECT id FROM users")) {
                require(transaction_ && query.sql.ends_with("FOR UPDATE")
                    && query.params.at(0) == "actio-local", "registration lacks the owner lock");
                ownerLocked_ = true;
                result.append({"actio-local"});
            } else if (query.sql.starts_with("SELECT value FROM user_preferences")) {
                require(query.params.at(0) == "actio-local" && query.params.at(1) == "task.categories.registered",
                    "wrong preference identity");
                result.append({pool_.preference});
            } else if (query.sql.contains("INSERT INTO user_preferences")) {
                require(ownerLocked_ && query.params.at(0) == "actio-local", "unlocked preference write");
                pool_.preference = query.params.at(2).value();
                ++pool_.preferenceWrites;
            } else if (query.sql.contains("json_agg(label ORDER BY label)")) {
                require(query.params.at(0) == "actio-local"
                    && query.sql.contains("status IN ('open', 'in_progress', 'todo', 'doing')")
                    && query.sql.contains("string_to_array(category, ',')"), "wrong task category selection");
                const auto registered = Json::parse(query.params.at(2).value());
                auto labels = Json::Array(registered.items());
                labels.emplace_back("Work");
                std::ranges::sort(labels, {}, [](const Json& label) { return label.as_string(); });
                const auto duplicates = std::ranges::unique(labels);
                labels.erase(duplicates.begin(), duplicates.end());
                const auto encoded = Json(std::move(labels)).dump();
                result.append({encoded});
            } else {
                return false;
            }
            return true;
        }

        void taskQuery(const portus::DbQuery& query, portus::DbResult& result) {
            if (query.sql.starts_with("LOCK TABLE tasks")) {
                require(transaction_, "task write outside transaction");
            } else if (query.sql.ends_with("FROM tasks WHERE id = $1 FOR UPDATE")) {
                const auto id = query.params.at(0).value();
                if (id == "missing") return;
                auto task = Json::object({{"id", id}, {"ownerId", "actio-local"}, {"assigneeId", "member"},
                    {"teamId", "team"}, {"lane", "backlog"}, {"deadline", "2026-11-26T00:00:00.000Z"},
                    {"durationDays", 2}});
                if (id == "outsider") task.set("teamId", "other-team");
                if (id == "personal") task.set("teamId", Json());
                if (id == "sprint") task.set("sprintId", "current");
                if (id == "daily") task.set("lane", "daily");
                const auto encoded = task.dump();
                result.append({encoded});
            } else if (query.sql.contains("FROM team_members")) {
                if (query.params.at(0) == "team") result.append({"1"});
            } else if (query.sql.contains("FROM team_refs")) {
                result.append({"minimal"});
            } else if (query.sql.starts_with("WITH changed AS (UPDATE tasks")) {
                const auto changes = Json::parse(query.params.at(0).value());
                require(transaction_ && changes.at("lane") == "daily" && changes.at("deadline").is_null()
                    && changes.at("duration_days") == Json(3) && changes.members().size() == 3,
                    "lane mutation must ignore extra fields and clear the previous deadline");
                const auto task = Json::object({{"id", query.params.at(1).value()}, {"teamId", "team"},
                    {"lane", "daily"}, {"deadline", Json()}, {"durationDays", 3}}).dump();
                result.append({task});
                ++pool_.taskWrites;
            } else {
                throw std::logic_error("unexpected query");
            }
        }

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline, portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "missing query deadline");
            if (query.sql.starts_with("INSERT INTO users") || categoryQuery(query, result)) return;
            taskQuery(query, result);
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

void checkCategories(const portus::Router& router, const FixturePool& pool) {
    const auto list = request(router, "GET", "/api/tasks/categories");
    require(list.status == 200 && Json::parse(list.body).at("items") == Json::array({"Legacy", "Work"}),
        "invalid legacy preferences or duplicate categories");
    require(request(router, "POST", "/api/tasks/categories", R"({"name":"  "})").status == 400,
        "blank category accepted");
    const auto added = request(router, "POST", "/api/tasks/categories", R"({"name":" A/B "})");
    require(added.status == 201 && Json::parse(added.body).at("items") == Json::array({"A/B", "Legacy", "Work"}),
        "registration did not return the updated list");
    require(request(router, "POST", "/api/tasks/categories", R"({"name":"A/B"})").status == 201
        && pool.preferenceWrites == 1, "duplicate registration changed storage");
    const auto removed = request(router, "DELETE", "/api/tasks/categories/A%2FB");
    require(removed.status == 200 && Json::parse(removed.body).at("items") == Json::array({"Legacy", "Work"}),
        "encoded category was not removed");
    const auto used = request(router, "DELETE", "/api/tasks/categories/Work");
    require(used.status == 200 && Json::parse(used.body).at("items") == Json::array({"Legacy", "Work"}),
        "unregistering a label removed it from open tasks");
}

void checkLane(const portus::Router& router, const FixturePool& pool) {
    constexpr const auto daily = R"({"lane":"daily"})";
    require(request(router, "PATCH", "/api/tasks/missing/lane", daily).status == 404, "missing task accepted");
    require(request(router, "PATCH", "/api/tasks/outsider/lane", daily).status == 403, "nonmember accepted");
    require(request(router, "PATCH", "/api/tasks/personal/lane", daily).status == 400, "personal task accepted");
    require(request(router, "PATCH", "/api/tasks/sprint/lane", daily).status == 400, "sprint task accepted");
    require(request(router, "PATCH", "/api/tasks/daily/lane", R"({"lane":"backlog"})").status == 400,
        "transition without supplied deadline or duration accepted");
    require(pool.taskWrites == 0, "rejected requests wrote tasks");
    const auto updated = request(router, "PATCH", "/api/tasks/backlog/lane",
        R"({"lane":"daily","duration_days":3,"title":"ignored"})");
    require(updated.status == 200 && Json::parse(updated.body).at("task").at("deadline").is_null()
        && pool.taskWrites == 1, "wrong lane response");
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    require(request(router, "GET", "/api/tasks/categories", "", true).status == 403
        && request(router, "PATCH", "/api/tasks/backlog/lane", "{}", true).status == 403
        && pool->acquired == 0, "forwarded request reached the database");
    checkCategories(router, *pool);
    checkLane(router, *pool);
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
