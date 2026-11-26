#include <cstdio>
#include <map>
#include <stdexcept>
#include <string>
#include "actio/concordia_routes.hpp"

namespace {
using portus::Json;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

// Stores team_members and team_refs.settings in memory and checks the SQL each route sends.
struct FixturePool final : portus::DbPool {
    int acquired = 0;
    int settingsWrites = 0;
    std::map<std::pair<std::string, std::string>, std::string> members{
        {{"team", "alice"}, "leader"}, {{"team", "bob"}, "member"}, {{"other", "alice"}, "member"}};
    std::string settings = R"({"input_mode":"full","legacy":1,"review_slots":["08:00"]})";

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& pool) : pool_(pool) {}
        void begin(portus::DbDeadline) override { transaction_ = true; }
        void commit(portus::DbDeadline) override { closeTransaction(); }
        void rollback(portus::DbDeadline) override { closeTransaction(); }

    private:
        FixturePool& pool_;
        bool transaction_ = false;
        bool locked_ = false;

        void closeTransaction() {
            transaction_ = false;
            locked_ = false;
        }

        static bool known(std::string_view team) { return team == "team" || team == "other"; }

        // Answer the two membership listings: by user (teamId, role) and by team (userId, role).
        bool memberList(const portus::DbQuery& query, portus::DbResult& result) const {
            const bool byUser = query.sql.contains("WHERE user_id = $1");
            if (!byUser && !query.sql.contains("WHERE team_id = $1 ORDER BY user_id")) return false;
            const auto key = query.params.at(0).value();
            for (const auto& [ids, role] : pool_.members) {
                if ((byUser ? ids.second : ids.first) == key) result.append({byUser ? ids.first : ids.second, role});
            }
            return true;
        }

        // Apply membership upserts and deletes to the in-memory table.
        void memberQuery(const portus::DbQuery& query, portus::DbResult& result) {
            if (memberList(query, result)) return;
            const auto first = std::string(query.params.at(0).value());
            if (query.sql.contains("INSERT INTO team_members")) {
                require(query.sql.contains("ON CONFLICT (team_id, user_id) DO UPDATE")
                    && query.sql.contains("EXISTS (SELECT 1 FROM team_refs WHERE id = $1)"),
                    "membership upsert must check the team in the same statement");
                if (!known(first)) return;
                const auto role = std::string(query.params.at(2).value());
                pool_.members[{first, std::string(query.params.at(1).value())}] = role;
                result.append({role});
            } else if (query.sql.starts_with("DELETE FROM team_members")) {
                if (pool_.members.erase({first, std::string(query.params.at(1).value())}) == 1)
                    result.append({"member"});
            } else {
                throw std::logic_error("unexpected membership query");
            }
        }

        // Answer team existence, settings reads and writes, and the team project listing.
        void teamQuery(const portus::DbQuery& query, portus::DbResult& result) {
            const auto team = query.params.at(0).value();
            if (query.sql == "SELECT 1 FROM team_refs WHERE id = $1") {
                if (known(team)) result.append({"1"});
            } else if (query.sql.starts_with("SELECT settings::text, cc_settings::text")) {
                if (known(team)) result.append({pool_.settings, R"({"repo":"cc"})"});
            } else if (query.sql.ends_with("FOR UPDATE")) {
                require(transaction_, "settings lock outside a transaction");
                locked_ = true;
                if (known(team)) result.append({pool_.settings});
            } else if (query.sql.starts_with("UPDATE team_refs SET settings")) {
                require(locked_, "settings written without the row lock");
                pool_.settings = query.params.at(1).value();
                ++pool_.settingsWrites;
            } else if (query.sql.contains("FROM project_refs")) {
                require(query.sql.contains("removed_at IS NULL")
                    && query.sql.contains("team_ids @> jsonb_build_array($1::text)"), "wrong project filter");
                if (team == "team") result.append({"Ac", "Actio"});
            } else {
                throw std::logic_error("unexpected team query");
            }
        }

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline, portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "missing query deadline");
            if (query.sql.starts_with("INSERT INTO users")) return;
            if (query.sql.contains("team_members")) memberQuery(query, result);
            else teamQuery(query, result);
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

void checkMembers(const portus::Router& router, FixturePool& pool) {
    const auto memberships = request(router, "GET", "/api/teams/memberships/alice");
    require(memberships.status == 200 && body(memberships).at("memberships") == Json::array({
        Json::object({{"teamId", "other"}, {"role", "member"}}),
        Json::object({{"teamId", "team"}, {"role", "leader"}})}), "wrong memberships");
    const auto members = request(router, "GET", "/api/teams/team/members");
    require(members.status == 200 && body(members).at("members").items().size() == 2, "wrong member list");
    require(request(router, "GET", "/api/teams/missing/members").status == 403, "unregistered team listed");

    require(body(request(router, "PUT", "/api/teams/team/members/carol", "not json")).at("error")
        == "role is required", "unparsable body must read as a missing role");
    require(request(router, "PUT", "/api/teams/team/members/carol", R"({"role":"admin"})").status == 400,
        "unknown role accepted");
    require(request(router, "PUT", "/api/teams/missing/members/carol", R"({"role":"member"})").status == 404,
        "membership of an unregistered team saved");
    const auto saved = request(router, "PUT", "/api/teams/team/members/bob", R"({"role":"leader"})");
    require(saved.status == 200 && body(saved).at("member") == Json::object({
        {"teamId", "team"}, {"userId", "bob"}, {"role", "leader"}})
        && pool.members.at({"team", "bob"}) == "leader", "role change not saved");

    require(request(router, "DELETE", "/api/teams/team/members/carol").status == 404, "missing member deleted");
    const auto removed = request(router, "DELETE", "/api/teams/team/members/bob");
    require(removed.status == 200 && body(removed).at("ok") == true && !pool.members.contains({"team", "bob"}),
        "member not removed");
}

void checkSettings(const portus::Router& router, FixturePool& pool) {
    const auto read = request(router, "GET", "/api/teams/team/settings");
    require(read.status == 200 && body(read).at("cc_settings").at("repo") == "cc"
        && body(read).at("settings").at("legacy") == Json(1), "settings must be returned as stored");
    require(request(router, "GET", "/api/teams/missing/settings").status == 403, "unregistered team settings read");

    require(request(router, "PATCH", "/api/teams/missing/settings", "not json").status == 403,
        "team role must be checked before the body");
    const auto unknown = request(router, "PATCH", "/api/teams/team/settings", R"({"colour":"red"})");
    require(unknown.status == 400 && body(unknown).at("error") == "Invalid settings"
        && !body(unknown).at("issues").items().empty(), "unknown settings key accepted");
    for (const auto* invalid : {R"({"notify_before_minutes":1441})", R"({"work_window":["10:00"]})",
                                R"({"review_slots":["24:00"]})", R"({"completion_threshold":1.5})",
                                R"({"default_daily_minutes":1.5})", R"({"phase_targets":[]})",
                                R"({"dod":[""]})", R"({"timezone":null})"}) {
        require(request(router, "PATCH", "/api/teams/team/settings", invalid).status == 400,
            "invalid setting accepted");
    }
    require(pool.settingsWrites == 0, "rejected patches wrote settings");

    const auto patched = request(router, "PATCH", "/api/teams/team/settings", R"({"wip_limit_per_member":3})");
    const auto settings = body(patched).at("settings");
    require(patched.status == 200 && settings.members().size() == 16
        && settings.members().front().first == "input_mode"
        && settings.at("input_mode") == "full" && settings.at("wip_limit_per_member") == Json(3)
        && settings.at("review_slots") == Json::array({"08:00"}) && settings.at("timezone") == "Asia/Tokyo"
        && !settings.find("legacy") && pool.settingsWrites == 1,
        "patch must keep stored values, fill defaults and drop unknown stored keys");
    require(Json::parse(pool.settings) == settings, "saved settings differ from the response");
}

void checkProjects(const portus::Router& router) {
    const auto projects = request(router, "GET", "/api/teams/team/projects");
    require(projects.status == 200 && body(projects).at("projects") == Json::array({
        Json::object({{"code", "Ac"}, {"name", "Actio"}})}), "wrong team projects");
    require(request(router, "GET", "/api/teams/missing/projects").status == 403, "unregistered team projects read");
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    require(request(router, "GET", "/api/teams/team/members", "", true).status == 403
        && request(router, "PUT", "/api/teams/team/members/x", R"({"role":"member"})", true).status == 403
        && pool->acquired == 0, "forwarded request reached the database");

    portus::HttpServerOptions disabledOptions;
    actio::addConcordiaReadRoutes(disabledOptions, false, pool);
    const portus::Router disabled(std::move(disabledOptions.routes));
    require(request(disabled, "GET", "/api/teams/memberships/alice").status == 403 && pool->acquired == 0,
        "team administration without local mode reached the database");

    checkMembers(router, *pool);
    checkSettings(router, *pool);
    checkProjects(router);
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
