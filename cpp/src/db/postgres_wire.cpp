#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#else
#include <cerrno>
#include <poll.h>
#endif
#include "postgres_wire.hpp"
#include <algorithm>
#include <array>
#include <limits>
#include <span>
#include "lorica/byte_view.hpp"
#include "lorica/input_budget.hpp"

namespace actio::db {
using Clock = std::chrono::steady_clock;

void requireTime(portus::DbDeadline deadline) {
    if (Clock::now() >= deadline) throw portus::DbTimeout("PostgreSQL deadline expired");
}

namespace {
// A signal or a rounded-up poll timeout must preserve the original deadline.
void waitSocket(PGconn& connection, bool writing, portus::DbDeadline deadline) {
    const auto events = static_cast<short>(writing ? POLLIN | POLLOUT : POLLIN);
    const int socket = PQsocket(&connection);
    if (socket < 0) throw portus::DbDisconnected("PostgreSQL socket unavailable");
    for (;;) {
        requireTime(deadline);
        const auto remaining = std::chrono::ceil<std::chrono::milliseconds>(deadline - Clock::now());
        const auto timeout = std::clamp(remaining, std::chrono::milliseconds{1},
                                       std::chrono::milliseconds{std::numeric_limits<int>::max()});
#ifdef _WIN32
        WSAPOLLFD descriptor{static_cast<SOCKET>(socket), events, 0};
        const auto ready = WSAPoll(&descriptor, 1, static_cast<int>(timeout.count()));
        if (ready < 0 && WSAGetLastError() == WSAEINTR) continue;
#else
        pollfd descriptor{socket, events, 0};
        const auto ready = ::poll(&descriptor, 1, static_cast<int>(timeout.count()));
        if (ready < 0 && errno == EINTR) continue;
#endif
        if (ready < 0 || (descriptor.revents & POLLNVAL) != 0)
            throw portus::DbDisconnected("PostgreSQL socket poll failed");
        if (ready == 0) continue;
        requireTime(deadline);
        return;
    }
}

void discardNotice(void*, const PGresult*) {}

void flushQuery(PGconn& connection, portus::DbDeadline deadline) {
    for (int pending = PQflush(&connection); pending != 0; pending = PQflush(&connection)) {
        if (pending < 0) throw portus::DbDisconnected("PostgreSQL command flush failed");
        waitSocket(connection, true, deadline);
        if (PQconsumeInput(&connection) != 1)
            throw portus::DbDisconnected("PostgreSQL connection lost during send");
    }
}
}

// Use the same deadline across each socket libpq selects during connection setup.
PgHandle connectPostgres(const std::string& url, const PostgresPolicy& policy, portus::DbDeadline deadline) {
    const auto keepalive = std::to_string(policy.keepalive_idle.count());
    const auto options = "-c statement_timeout=" + std::to_string(policy.statement_timeout.count());
    const std::array<const char*, 6> keys{
        "dbname", "options", "keepalives", "keepalives_idle", "client_encoding", nullptr};
    const std::array<const char*, 6> values{url.c_str(), options.c_str(), "1", keepalive.c_str(), "UTF8", nullptr};
    requireTime(deadline);
    PgHandle connection(PQconnectStartParams(keys.data(), values.data(), 1), PQfinish);
    requireTime(deadline);
    if (!connection || PQstatus(connection.get()) == CONNECTION_BAD)
        throw portus::DbDisconnected("PostgreSQL connection failed");
    PQsetNoticeReceiver(connection.get(), discardNotice, nullptr);
    auto status = PGRES_POLLING_WRITING;
    while (status == PGRES_POLLING_READING || status == PGRES_POLLING_WRITING || status == PGRES_POLLING_ACTIVE) {
        requireTime(deadline);
        if (status != PGRES_POLLING_ACTIVE)
            waitSocket(*connection, status == PGRES_POLLING_WRITING, deadline);
        status = PQconnectPoll(connection.get());
    }
    requireTime(deadline);
    if (status != PGRES_POLLING_OK || PQsetnonblocking(connection.get(), 1) != 0)
        throw portus::DbDisconnected("PostgreSQL connection failed");
    return connection;
}

// libpq needs terminated text and a null pointer for SQL NULL. Reserve before taking pointers.
void sendQuery(PGconn& connection, const portus::DbQuery& query, portus::DbDeadline deadline) {
    const std::string sql(query.sql);
    std::vector<std::optional<std::string>> owned;
    std::vector<const char*> values;
    owned.reserve(query.params.size());
    values.reserve(query.params.size());
    lorica::input_budget budget({portus::db_max_result_bytes, portus::db_max_params, portus::db_max_params, 1});
    for (const auto& parameter : query.params) {
        if (!budget.consume(parameter ? parameter->size() : 0, 1, parameter ? 1 : 0))
            throw std::length_error("PostgreSQL parameter budget exceeded");
        owned.emplace_back(parameter);
        values.push_back(owned.back() ? owned.back()->c_str() : nullptr);
    }
    requireTime(deadline);
    if (PQsendQueryParams(&connection, sql.c_str(), static_cast<int>(values.size()), nullptr,
                          values.data(), nullptr, nullptr, 0) != 1 || PQsetSingleRowMode(&connection) != 1)
        throw portus::DbDisconnected("PostgreSQL command could not be sent");
    flushQuery(connection, deadline);
}

PgResult readResult(PGconn& connection, portus::DbDeadline deadline) {
    requireTime(deadline);
    while (PQisBusy(&connection) != 0) {
        waitSocket(connection, false, deadline);
        if (PQconsumeInput(&connection) != 1)
            throw portus::DbDisconnected("PostgreSQL response read failed");
    }
    return PgResult(PQgetResult(&connection), PQclear);
}

// The PGresult owns the field buffers until DbResult has copied the complete row.
void appendRow(const PGresult& row, portus::DbResult& result) {
    const int count = PQnfields(&row);
    if (count < 0 || static_cast<std::size_t>(count) > portus::db_max_columns)
        throw std::length_error("PostgreSQL column limit exceeded");
    std::vector<portus::DbText> fields;
    fields.reserve(static_cast<std::size_t>(count));
    for (int column = 0; column < count; ++column) {
        if (PQgetisnull(&row, 0, column) != 0) {
            fields.emplace_back();
            continue;
        }
        const auto* value = PQgetvalue(&row, 0, column);
        const int length = PQgetlength(&row, 0, column);
        if (!value || length < 0 || static_cast<std::size_t>(length) > portus::db_max_value_bytes)
            throw std::length_error("PostgreSQL field limit exceeded");
        const auto bytes = std::as_bytes(std::span(value, static_cast<std::size_t>(length)));
        const auto field = lorica::byte_view::make(bytes.data(), bytes.size(), portus::db_max_value_bytes);
        if (!field) throw std::length_error("PostgreSQL field buffer unavailable");
        fields.emplace_back(std::string_view(value, field->size()));
    }
    result.append(fields);
}
}
