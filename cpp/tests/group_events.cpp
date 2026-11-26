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

Json text(const portus::DbText& value) { return value ? Json(std::string(*value)) : Json(); }
Json number(const portus::DbText& value) { return value ? Json(std::stod(std::string(*value))) : Json(); }
bool flag(const portus::DbText& value) { return value == "true"; }

// Decode one bound update value by its column position.
Json column(std::size_t index, const portus::DbText& value) {
    if (index == 4) return Json(flag(value));
    if (index == 5 || index == 6) return number(value);
    return text(value);
}

// Holds the local owner's membership of g1, the group's events and schedules, and checks the SQL each route sends.
struct FixturePool final : portus::DbPool {
    int acquired = 0;
    std::map<std::string, Json> events;
    std::map<std::string, Json> schedules;

    class Connection final : public portus::DbConnection {
    public:
        explicit Connection(FixturePool& pool) : pool_(pool) {}
        void begin(portus::DbDeadline) override {}
        void commit(portus::DbDeadline) override {}
        void rollback(portus::DbDeadline) override {}

    private:
        FixturePool& pool_;

        static void emit(const Json& row, portus::DbResult& result) {
            const auto encoded = row.dump();
            result.append({encoded});
        }

        // Build the row the INSERT ... RETURNING projection would answer.
        void insertEvent(const portus::DbQuery& query, portus::DbResult& result) {
            const auto& params = query.params;
            require(params.size() == 11 && params.at(1) == "g1" && params.at(10) == "actio-local", "wrong event insert");
            const Json event = Json::object({
                {"id", text(params.at(0))}, {"groupId", text(params.at(1))}, {"title", text(params.at(2))},
                {"description", text(params.at(3))}, {"date", text(params.at(4))}, {"endDate", text(params.at(5))},
                {"allDay", flag(params.at(6))}, {"period", number(params.at(7))}, {"duration", number(params.at(8))},
                {"eventType", text(params.at(9))}, {"createdBy", text(params.at(10))},
                {"createdAt", "2026-11-26T00:00:00.000Z"}});
            pool_.events[std::string(*params.at(0))] = event;
            emit(event, result);
        }

        // Apply each flagged (set, value) pair in statement order.
        void updateEvent(const portus::DbQuery& query, portus::DbResult& result) {
            const auto& params = query.params;
            require(params.size() == 18, "update must bind eight flagged columns");
            const auto found = pool_.events.find(std::string(*params.at(0)));
            if (found == pool_.events.end() || found->second.at("groupId") != text(params.at(1))) return;
            const char* keys[] = {"title", "description", "date", "endDate", "allDay", "period", "duration", "eventType"};
            for (std::size_t i = 0; i < 8; ++i) {
                if (!flag(params.at(2 + i * 2))) continue;
                const auto& value = params.at(3 + i * 2);
                found->second.set(keys[i], column(i, value));
            }
            emit(found->second, result);
        }

        void insertSchedule(const portus::DbQuery& query, portus::DbResult& result) {
            const auto& params = query.params;
            require(params.size() == 9 && params.at(8) == "actio-local", "wrong schedule insert");
            const Json schedule = Json::object({
                {"id", text(params.at(0))}, {"groupId", text(params.at(1))}, {"title", text(params.at(2))}, {"description", Json()},
                {"day", number(params.at(3))}, {"period", number(params.at(4))}, {"duration", number(params.at(5))},
                {"date", text(params.at(6))}, {"scheduleType", text(params.at(7))}, {"createdBy", text(params.at(8))},
                {"createdAt", "2026-11-26T00:00:00.000Z"}});
            pool_.schedules[std::string(*params.at(0))] = schedule;
            emit(schedule, result);
        }

        bool eventInGroup(const portus::DbQuery& query) const {
            const auto found = pool_.events.find(std::string(*query.params.at(0)));
            return found != pool_.events.end() && found->second.at("groupId") == text(query.params.at(1));
        }

        // Answer the membership, existence and listing reads.
        bool read(const portus::DbQuery& query, portus::DbResult& result) const {
            const auto& sql = query.sql;
            if (sql.starts_with("SELECT 1 FROM group_members")) {
                if (query.params.at(0) == "g1" && query.params.at(1) == "actio-local") result.append({"1"});
            } else if (sql.starts_with("SELECT 1 FROM group_events")) {
                if (eventInGroup(query)) result.append({"1"});
            } else if (sql.starts_with("SELECT json_build_object")) {
                require(sql.contains("ORDER BY date, created_at, id") && query.max_rows == portus::db_max_rows,
                    "listing must keep date order within the row cap");
                for (const auto& [id, event] : pool_.events)
                    if (event.at("groupId") == text(query.params.at(0))) emit(event, result);
            } else {
                return false;
            }
            return true;
        }

        void removeEvent(const portus::DbQuery& query, portus::DbResult& result) {
            if (!eventInGroup(query)) return;
            pool_.events.erase(std::string(*query.params.at(0)));
            result.append({"1"});
        }

        void execute(const portus::DbQuery& query, portus::DbDeadline deadline, portus::DbResult& result) override {
            require(deadline > std::chrono::steady_clock::now(), "missing query deadline");
            const auto& sql = query.sql;
            if (sql.starts_with("INSERT INTO users") || read(query, result)) return;
            if (sql.contains("INSERT INTO group_events")) insertEvent(query, result);
            else if (sql.contains("UPDATE group_events")) updateEvent(query, result);
            else if (sql.starts_with("DELETE FROM group_events")) removeEvent(query, result);
            else if (sql.contains("INSERT INTO group_schedules")) insertSchedule(query, result);
            else throw std::logic_error("unexpected group query");
        }
    };

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline) override {
        ++acquired;
        return std::make_unique<Connection>(*this);
    }
};

portus::Reply request(const portus::Router& router, const char* method, const std::string& path,
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

bool rejects(const portus::Reply& reply, int status, const char* message) {
    return reply.status == status && body(reply).at("error") == message;
}

void checkMembership(const portus::Router& router, const FixturePool& pool) {
    for (const auto* method : {"GET", "POST"}) {
        require(rejects(request(router, method, "/api/groups/g2/events", "not json"), 403, "Not a member"),
            "events of a group the owner does not belong to");
    }
    require(rejects(request(router, "PUT", "/api/groups/g2/events/e1", "not json"), 403, "Not a member")
        && rejects(request(router, "DELETE", "/api/groups/g2/events/e1"), 403, "Not a member")
        && rejects(request(router, "POST", "/api/groups/g2/schedules", "{}"), 403, "Not a member"),
        "membership must be checked before the event and the body");
    require(pool.events.empty() && pool.schedules.empty(), "non-member request wrote rows");
}

void checkInvalidEvents(const portus::Router& router, const FixturePool& pool) {
    const auto path = "/api/groups/g1/events";
    require(rejects(request(router, "POST", path, "not json"), 400, "Invalid JSON body")
        && rejects(request(router, "POST", path, R"({"title":"文化祭"})"), 400, "title and date are required")
        && rejects(request(router, "POST", path, R"({"title":"","date":"2026-12-01"})"), 400,
                   "title and date are required")
        && rejects(request(router, "POST", path, R"({"title":"a","date":"2026-12-01","allDay":"no"})"), 400,
                   "allDay must be a boolean")
        && rejects(request(router, "POST", path, R"({"title":"a","date":"2026-12-01","period":1.5})"), 400,
                   "period must be an integer"), "invalid event accepted");
    require(pool.events.empty(), "rejected event written");
}

std::string checkCreate(const portus::Router& router, FixturePool& pool) {
    checkInvalidEvents(router, pool);
    const auto path = "/api/groups/g1/events";
    const auto created = request(router, "POST", path, R"({"title":"文化祭","date":"2026-12-01","description":""})");
    const auto event = body(created).at("event");
    require(created.status == 201 && event.at("groupId") == "g1" && event.at("allDay") == true
        && event.at("description").is_null() && event.at("period").is_null() && event.at("duration") == 1.0
        && event.at("eventType") == "event" && event.at("createdBy") == "actio-local"
        && !event.at("id").as_string().empty(), "event defaults differ from Node");
    const auto timed = request(router, "POST", path, R"({"title":"審査会","date":"2026-12-02","endDate":"2026-12-03",)"
        R"("allDay":false,"period":2,"duration":3,"eventType":"examination_period"})");
    const auto second = body(timed).at("event");
    require(timed.status == 201 && second.at("allDay") == false && second.at("period") == 2.0
        && second.at("duration") == 3.0 && second.at("endDate") == "2026-12-03"
        && second.at("eventType") == "examination_period", "submitted event fields lost");
    const auto listed = body(request(router, "GET", path)).at("events").items();
    require(listed.size() == 2, "group events not listed");
    return event.at("id").as_string();
}

void checkUpdateAndDelete(const portus::Router& router, FixturePool& pool, const std::string& id) {
    const auto path = "/api/groups/g1/events/" + id;
    require(rejects(request(router, "PUT", "/api/groups/g1/events/missing", "not json"), 404, "Event not found"),
        "missing event must answer 404 before the body");
    require(rejects(request(router, "PUT", path, R"({"title":null})"), 400, "title must be a string")
        && rejects(request(router, "PUT", path, R"({"allDay":null})"), 400, "allDay must be a boolean"),
        "NOT NULL column cleared");
    const auto updated = request(router, "PUT", path,
        R"({"description":null,"allDay":false,"period":3,"endDate":"2026-12-04"})");
    const auto event = body(updated).at("event");
    require(updated.status == 200 && event.at("title") == "文化祭" && event.at("allDay") == false
        && event.at("period") == 3.0 && event.at("endDate") == "2026-12-04" && event.at("duration") == 1.0,
        "update did not keep unsent fields");
    const auto unchanged = request(router, "PUT", path, "{}");
    require(unchanged.status == 200 && body(unchanged).at("event") == event, "empty update changed the event");

    require(rejects(request(router, "DELETE", "/api/groups/g1/events/missing"), 404, "Event not found"),
        "missing event removed");
    const auto removed = request(router, "DELETE", path);
    require(removed.status == 200 && body(removed).at("deleted") == id && !pool.events.contains(id),
        "event not removed");
}

void checkSchedule(const portus::Router& router, const FixturePool& pool) {
    const auto path = "/api/groups/g1/schedules";
    require(rejects(request(router, "POST", path, R"({"title":"ゼミ","period":1})"), 400,
                    "title, day, period are required")
        && rejects(request(router, "POST", path, R"({"title":"ゼミ","day":7,"period":1})"), 400, "day must be 0-6")
        && rejects(request(router, "POST", path, R"({"title":"ゼミ","day":1,"period":11})"), 400,
                   "period must be 0-10"), "invalid schedule accepted");
    require(pool.schedules.empty(), "rejected schedule written");
    const auto created = request(router, "POST", path, R"({"title":"ゼミ","day":0,"period":10,"duration":0})");
    const auto schedule = body(created).at("schedule");
    require(created.status == 201 && schedule.at("day") == 0.0 && schedule.at("period") == 10.0
        && schedule.at("duration") == 1.0 && schedule.at("scheduleType") == "recurring"
        && schedule.at("date").is_null() && schedule.at("createdBy") == "actio-local", "schedule defaults differ");
}
}

int main() try {
    auto pool = std::make_shared<FixturePool>();
    portus::HttpServerOptions options;
    actio::addConcordiaReadRoutes(options, true, pool);
    const portus::Router router(std::move(options.routes));
    require(request(router, "GET", "/api/groups/g1/events", "", true).status == 403 && pool->acquired == 0,
        "forwarded request reached the database");

    portus::HttpServerOptions disabledOptions;
    actio::addConcordiaReadRoutes(disabledOptions, false, pool);
    const portus::Router disabled(std::move(disabledOptions.routes));
    require(rejects(request(disabled, "POST", "/api/groups/g1/events", "{}"), 401, "Authentication required")
        && pool->acquired == 0, "group events without local mode reached the database");

    checkMembership(router, *pool);
    const auto id = checkCreate(router, *pool);
    checkUpdateAndDelete(router, *pool, id);
    checkSchedule(router, *pool);
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "%s\n", error.what());
    return 1;
}
