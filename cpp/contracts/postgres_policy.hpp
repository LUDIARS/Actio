#pragma once
#include <chrono>
#include "../src/db/postgres_policy.hpp"
#include "augur/contract_runtime.hpp"

namespace actio::contracts {
inline const auto postgres_policy = augur::post_only([](const db::PostgresPolicy& policy) {
    using namespace std::chrono_literals;
    return policy.capacity == 10 && policy.acquire_timeout == 10s
        && policy.statement_timeout == 7s && policy.keepalive_idle == 15s;
});
}
