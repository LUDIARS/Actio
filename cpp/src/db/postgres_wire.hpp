#pragma once
#include <memory>
#include <string_view>
#include <libpq-fe.h>
#include "portus/db.hpp"
#include "postgres_policy.hpp"

namespace actio::db {
using PgHandle = std::unique_ptr<PGconn, decltype(&PQfinish)>;
using PgResult = std::unique_ptr<PGresult, decltype(&PQclear)>;

// Open a libpq session with Actio's transport settings.
PgHandle connectPostgres(const std::string& url, const PostgresPolicy& policy, portus::DbDeadline deadline);
// Reject work when its absolute monotonic deadline has elapsed.
void requireTime(portus::DbDeadline deadline);
// Bind text parameters and flush a single-row-mode command.
void sendQuery(PGconn& connection, const portus::DbQuery& query, portus::DbDeadline deadline);
// Read the next libpq result, or an empty handle after the command drains.
PgResult readResult(PGconn& connection, portus::DbDeadline deadline);
// Copy validated nullable fields into the Portus result budget.
void appendRow(const PGresult& row, portus::DbResult& result);
}
