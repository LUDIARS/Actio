#pragma once
#include <memory>
#include <string>
#include "portus/db.hpp"

namespace actio {
// The deployment bootstrap supplies the resolved DATABASE_URL via the process environment.
std::unique_ptr<portus::DbPool> makeInjectedPostgresPool();
// Create a lazy connection pool from a URL already resolved by the caller.
std::unique_ptr<portus::DbPool> makePostgresPool(std::string database_url);
}
