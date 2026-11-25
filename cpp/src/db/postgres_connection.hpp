#pragma once
#include "postgres_wire.hpp"

namespace actio::db {
// Mutated only by the worker owning the lease.
class PostgresConnection : public portus::DbConnection {
public:
    // Set the per-command cap for this lease.
    explicit PostgresConnection(const PostgresPolicy& policy);
    // Open a transaction on this session.
    void begin(portus::DbDeadline deadline) override;
    // Require PostgreSQL to confirm an actual commit.
    void commit(portus::DbDeadline deadline) override;
    // Restore an idle session after a completed SQL error or explicit abort.
    void rollback(portus::DbDeadline deadline) override;

protected:
    PgHandle connection_;

private:
    void execute(const portus::DbQuery& request, portus::DbDeadline deadline, portus::DbResult& result) override;
    void run(const portus::DbQuery& query, portus::DbDeadline deadline, portus::DbResult* rows,
             std::string_view command_tag = {});
    const std::chrono::milliseconds statement_timeout_;
};
}
