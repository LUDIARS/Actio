#pragma once
#include <chrono>
#include <cstddef>

namespace actio::db {
// PostgreSQL limits shared by pool acquisition, connection setup and queries.
struct PostgresPolicy {
    std::size_t capacity;
    std::chrono::seconds acquire_timeout;
    std::chrono::milliseconds statement_timeout;
    std::chrono::seconds keepalive_idle;
    std::chrono::seconds idle_timeout;
};

// Match the production limits of the existing Actio PostgreSQL adapter.
PostgresPolicy postgresPolicy();
}
