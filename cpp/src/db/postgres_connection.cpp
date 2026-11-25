#include "postgres_connection.hpp"
#include <algorithm>

namespace actio::db {
namespace {
enum class Outcome { pending, success, rejected, timed_out };

Outcome observeResult(PGresult& response, portus::DbResult* rows, std::string_view command_tag) {
    switch (PQresultStatus(&response)) {
        case PGRES_SINGLE_TUPLE:
            if (!rows) throw portus::DbDisconnected("Unexpected PostgreSQL transaction response");
            appendRow(response, *rows);
            return Outcome::pending;
        case PGRES_COMMAND_OK:
        case PGRES_TUPLES_OK:
            return command_tag.empty() || command_tag == PQcmdStatus(&response)
                ? Outcome::success : Outcome::rejected;
        case PGRES_FATAL_ERROR: {
            const char* state = PQresultErrorField(&response, PG_DIAG_SQLSTATE);
            if (!state) throw portus::DbDisconnected("PostgreSQL command response lost");
            return std::string_view(state) == "57014" ? Outcome::timed_out : Outcome::rejected;
        }
        default:
            // COPY and protocol errors cannot be drained as ordinary result rows.
            throw portus::DbDisconnected("Unsupported PostgreSQL command response");
    }
}
}

PostgresConnection::PostgresConnection(const PostgresPolicy& policy)
    : connection_(nullptr, PQfinish), statement_timeout_(policy.statement_timeout) {}

void PostgresConnection::begin(portus::DbDeadline deadline) {
    if (connection_ && PQtransactionStatus(connection_.get()) != PQTRANS_IDLE)
        throw std::logic_error("PostgreSQL transaction already active");
    run({"BEGIN", {}, 0}, deadline, nullptr, "BEGIN");
}

void PostgresConnection::commit(portus::DbDeadline deadline) {
    if (connection_ && PQtransactionStatus(connection_.get()) != PQTRANS_INTRANS)
        throw std::logic_error("PostgreSQL transaction cannot commit");
    run({"COMMIT", {}, 0}, deadline, nullptr, "COMMIT");
}

void PostgresConnection::rollback(portus::DbDeadline deadline) {
    if (connection_ && PQtransactionStatus(connection_.get()) == PQTRANS_IDLE) return;
    run({"ROLLBACK", {}, 0}, deadline, nullptr, "ROLLBACK");
}

void PostgresConnection::execute(const portus::DbQuery& request, portus::DbDeadline deadline,
                                 portus::DbResult& result) {
    run(request, deadline, &result);
}

void PostgresConnection::run(const portus::DbQuery& query, portus::DbDeadline deadline,
                             portus::DbResult* rows, std::string_view command_tag) {
    deadline = std::min(deadline, std::chrono::steady_clock::now() + statement_timeout_);
    requireTime(deadline);
    if (!connection_) throw portus::DbDisconnected("PostgreSQL lease invalidated");
    auto outcome = Outcome::pending;
    try {
        sendQuery(*connection_, query, deadline);
        while (const auto response = readResult(*connection_, deadline)) {
            const auto seen = observeResult(*response, rows, command_tag);
            if (seen != Outcome::pending) outcome = seen;
        }
        if (PQstatus(connection_.get()) != CONNECTION_OK || outcome == Outcome::pending)
            throw portus::DbDisconnected("PostgreSQL response incomplete");
    } catch (...) {
        // A partially consumed response or uncertain write must never enter the idle pool.
        connection_.reset();
        throw;
    }
    if (outcome == Outcome::timed_out) throw portus::DbTimeout("PostgreSQL statement canceled");
    if (outcome == Outcome::rejected) throw std::runtime_error("PostgreSQL statement rejected");
}
}
