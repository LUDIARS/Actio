#include "postgres_policy.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:b889f12e */
#include "../../contracts/postgres_policy.hpp" /* augur-inject:contract-predicate:decf9a29 */

namespace actio::db {
PostgresPolicy postgresPolicy() { return ::augur::invoke_observed(::augur::ContractSpec{"C-29", "ff4f9c73", "src/db/postgres_policy.cpp:4"}, actio::contracts::postgres_policy, [&]() -> PostgresPolicy { /* augur-inject:contract-wrap:ff4f9c73 */
    using namespace std::chrono_literals;
    return {10, 10s, 7000ms, 15s, 30s};
}); /* augur-inject:contract-end:ff4f9c73 */ }
}
