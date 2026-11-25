#include "actio/concordia_routes.hpp"
#include <cstdio>
#include <stdexcept>
#include <string_view>
#include "actio/local_access.hpp"

namespace {
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

struct FixturePool final : portus::DbPool {
    int leases = 0;
    int anchors = 0;
    bool unavailable = false;

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& pool) : pool_(pool) {}
        void begin(portus::DbDeadline) override { throw std::logic_error("unexpected transaction"); }
        void commit(portus::DbDeadline) override { throw std::logic_error("unexpected transaction"); }
        void rollback(portus::DbDeadline) override { throw std::logic_error("unexpected transaction"); }

    private:
        FixturePool& pool_;

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline,
                     portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "DB deadline must be in the future");
            if (query.sql.starts_with("INSERT INTO users")) {
                require(query.params.size() == 1 && query.params.front() == "actio-local"
                    && query.sql.contains("ON CONFLICT (id) DO NOTHING"), "invalid local owner insert");
                ++pool_.anchors;
            } else if (query.sql.contains("FROM team_refs")) {
                result.append({"team-1", "first", "First team"});
            } else if (query.sql.contains("FROM project_refs WHERE removed_at IS NULL")) {
                result.append({"At", "Actio", "[\"team-1\"]", "2026-11-25T13:44:00.000Z"});
            } else {
                throw std::logic_error("unexpected query");
            }
        }
    };

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        ++leases;
        if (unavailable) throw portus::DbTimeout("test timeout");
        return std::make_unique<Connection>(*this);
    }
};

portus::RequestContext localRequest() {
    portus::RequestContext request;
    request.path = "/api/auth/me";
    request.remote_addr = "127.0.0.1";
    request.headers.add("Host", "127.0.0.1:17880");
    return request;
}

portus::Reply get(const portus::Router& router, const char* path, portus::RequestContext request) {
    request.path = path;
    const auto route = router.match("GET", path);
    require(route.has_value(), "route missing");
    return route->def->handler(request);
}

void checkBoundary() {
    require(actio::allowsLocalOwner(localRequest()), "direct loopback rejected");
    auto browser = localRequest();
    browser.headers.add("Origin", "http://localhost:17880");
    browser.headers.add("Sec-Fetch-Site", "same-origin");
    require(actio::allowsLocalOwner(browser), "same-origin browser rejected");
    for (const auto& [header, value] : portus::HeaderList{
             {"CF-Access-Jwt-Assertion", "opaque"}, {"Forwarded", "for=127.0.0.1"},
             {"X-Forwarded-For", "127.0.0.1"}, {"Origin", "https://example.invalid"},
             {"Sec-Fetch-Site", "same-site"}, {"Sec-Fetch-Mode", "no-cors"},
             {"Host", "localhost"}}) {
        auto request = localRequest();
        request.headers.add(header, value);
        require(!actio::allowsLocalOwner(request), "unsafe browser or proxy request acquired ownership");
    }
    auto remote = localRequest();
    remote.remote_addr = "192.0.2.1";
    require(!actio::allowsLocalOwner(remote), "remote socket acquired ownership");
}

void checkRoutes() {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    auto proxy = localRequest();
    proxy.headers.add("X-Real-IP", "127.0.0.1");
    const auto denied = get(router, "/api/teams", proxy);
    require(denied.status == 403 && pool->leases == 0
        && portus::Json::parse(denied.body).at("error") == "local_access_required",
        "proxy reached the database");
    pool->unavailable = true;
    require(get(router, "/api/auth/me", localRequest()).status == 503, "DB timeout not reported");
    pool->unavailable = false;
    const auto reply = get(router, "/api/auth/me", localRequest());
    const auto user = portus::Json::parse(reply.body);
    require(reply.status == 200 && user.at("id") == "actio-local" && user.at("access") == "loopback"
        && user.at("localMode").as_bool() && user.at("major").is_null(), "wrong local owner profile");
    require(get(router, "/api/auth/me", localRequest()).status == 200
        && pool->leases == 2 && pool->anchors == 1, "owner anchor was not cached after success");
    const auto teams = get(router, "/api/teams", localRequest());
    const auto teamBody = portus::Json::parse(teams.body);
    require(teams.status == 200 && teamBody.at("teams").items().at(0).at("role") == "leader",
        "local owner did not receive leader access");
    const auto projects = get(router, "/api/projects/cc", localRequest());
    const auto projectBody = portus::Json::parse(projects.body);
    const auto& project = projectBody.at("projects").items().at(0);
    require(projects.status == 200 && project.at("teamIds").items().at(0) == "team-1"
        && project.at("syncedAt") == "2026-11-25T13:44:00.000Z", "wrong Cc project projection");

    portus::HttpServerOptions disabled;
    actio::addConcordiaReadRoutes(disabled, false, pool);
    const portus::Router disabledRouter(std::move(disabled.routes));
    require(get(disabledRouter, "/api/auth/me", localRequest()).status == 401 && pool->leases == 4,
        "disabled local mode granted owner access");
}
}

int main() try {
    checkBoundary();
    checkRoutes();
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
