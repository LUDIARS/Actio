#include "actio/liveness.hpp"
#include "portus/util.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:63e3bff0 */
#include "../contracts/liveness.hpp" /* augur-inject:contract-predicate:1f5e6426 */

namespace actio {
portus::Json liveStatus(const std::string& version, std::int64_t epochMs) { return ::augur::invoke_observed(::augur::ContractSpec{"C-28", "20bfcbd1", "src/liveness.cpp:5"}, actio::contracts::live_status, [&]() -> portus::Json { /* augur-inject:contract-wrap:20bfcbd1 */
    return portus::Json::object({
        {"status", "ok"}, {"service", "actio"},
        {"version", version}, {"timestamp", portus::iso_time(epochMs)}
    });
}, version, epochMs); /* augur-inject:contract-end:20bfcbd1 */ }
}
