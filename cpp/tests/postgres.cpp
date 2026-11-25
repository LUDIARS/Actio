#include "actio/postgres.hpp"
#include "postgres_wire.hpp"
#include <array>

namespace {
class SyntheticRows final : public portus::DbConnection {
public:
    void begin(portus::DbDeadline) override {}
    void commit(portus::DbDeadline) override {}
    void rollback(portus::DbDeadline) override {}

private:
    void execute(const portus::DbQuery&, portus::DbDeadline, portus::DbResult& destination) override {
        actio::db::PgResult row(PQmakeEmptyPGresult(nullptr, PGRES_SINGLE_TUPLE), PQclear);
        std::array<PGresAttDesc, 3> attributes{};
        std::array<char, 2> value{'a', 'b'};
        if (!row || PQsetResultAttrs(row.get(), static_cast<int>(attributes.size()), attributes.data()) != 1
            || PQsetvalue(row.get(), 0, 0, nullptr, -1) != 1
            || PQsetvalue(row.get(), 0, 1, value.data(), 0) != 1
            || PQsetvalue(row.get(), 0, 2, value.data(), static_cast<int>(value.size())) != 1)
            throw std::runtime_error("Could not construct the test row");
        actio::db::appendRow(*row, destination);
    }
};

bool expiredAcquisition() {
    try {
        auto pool = actio::makePostgresPool("postgresql://unused.invalid/actio");
        pool->acquire(std::chrono::steady_clock::now());
    } catch (const portus::DbTimeout&) {
        return true;
    }
    return false;
}

bool invalidConfiguration() {
    try {
        actio::makePostgresPool("");
    } catch (const std::invalid_argument&) {
        return true;
    }
    return false;
}
}

int main() {
    using namespace std::chrono_literals;
    const auto policy = actio::db::postgresPolicy();
    SyntheticRows connection;
    const auto rows = connection.query({"SELECT 1", {}, 1}, std::chrono::steady_clock::now() + 1s);
    const portus::DbRow expected{std::nullopt, std::string{}, std::string("ab")};
    return policy.capacity == 10 && policy.acquire_timeout == 10s && policy.statement_timeout == 7s
        && policy.keepalive_idle == 15s && policy.idle_timeout == 30s && expiredAcquisition()
        && invalidConfiguration() && rows.size() == 1 && rows.front() == expected ? 0 : 1;
}
