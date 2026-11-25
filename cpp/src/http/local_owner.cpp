#include "actio/local_owner.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:d51bbdf8 */
#include "../../contracts/local_owner.hpp" /* augur-inject:contract-predicate:1a9ae80c */

namespace actio {
portus::Json localOwnerProfile() { return ::augur::invoke_observed(::augur::ContractSpec{"C-31", "d65cbc6c", "src/http/local_owner.cpp:4"}, actio::contracts::local_owner, [&]() -> portus::Json { /* augur-inject:contract-wrap:d65cbc6c */
    return portus::Json::object({
        {"id", local_owner_id}, {"name", "Local user"}, {"email", ""}, {"role", "general"},
        {"localMode", true}, {"access", "loopback"}, {"major", nullptr}, {"calendarAccessId", nullptr}
    });
}); /* augur-inject:contract-end:d65cbc6c */ }

void provisionLocalOwner(portus::DbConnection& connection, portus::DbDeadline deadline) {
    connection.query({
        "INSERT INTO users (id, created_at, updated_at) "
        "VALUES ($1, statement_timestamp() AT TIME ZONE 'UTC', statement_timestamp() AT TIME ZONE 'UTC') "
        "ON CONFLICT (id) DO NOTHING",
        {local_owner_id}, 1
    }, deadline);
}
}
