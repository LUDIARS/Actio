#include "actio/postgres.hpp"
#include "postgres_connection.hpp"
#include <algorithm>
#include <condition_variable>
#include <future>
#include <mutex>
#include <thread>
#include <utility>
#include "portus/env.hpp"

namespace actio::db {
namespace {
using Clock = std::chrono::steady_clock;
constexpr std::size_t database_url_limit = 16 * 1024;

class PoolState {
public:
    explicit PoolState(std::string database_url) : url(std::move(database_url)) {
        idle_.reserve(policy.capacity);
    }

    PgHandle checkout(portus::DbDeadline deadline) {
        std::unique_lock lock(mutex_);
        if (!available_.wait_until(lock, deadline, [&] { return !idle_.empty() || total_ < policy.capacity; }))
            throw portus::DbTimeout("PostgreSQL pool wait expired");
        requireTime(deadline);
        while (!idle_.empty()) {
            auto entry = std::move(idle_.back());
            idle_.pop_back();
            if (Clock::now() < entry.expires) return std::move(entry.connection);
            // All earlier entries expired too. Close before releasing their slots.
            total_ -= idle_.size() + 1;
            idle_.clear();
            available_.notify_all();
        }
        ++total_;
        return PgHandle(nullptr, PQfinish);
    }

    void checkin(PgHandle connection) {
        if (connection && (PQstatus(connection.get()) != CONNECTION_OK
                           || PQtransactionStatus(connection.get()) != PQTRANS_IDLE))
            connection.reset();
        {
            const std::lock_guard lock(mutex_);
            if (connection) idle_.push_back({std::move(connection), Clock::now() + policy.idle_timeout});
            else --total_;
        }
        available_.notify_one();
    }

    const std::string url;
    const PostgresPolicy policy = postgresPolicy();

private:
    struct Idle {
        PgHandle connection;
        portus::DbDeadline expires;
    };
    std::mutex mutex_;
    std::condition_variable available_;
    std::vector<Idle> idle_;
    std::size_t total_ = 0;
};

class Lease final : public PostgresConnection {
public:
    Lease(std::shared_ptr<PoolState> state, portus::DbDeadline deadline)
        : PostgresConnection(state->policy), state_(std::move(state)) {
        connection_ = state_->checkout(deadline);
    }
    ~Lease() override { state_->checkin(std::move(connection_)); }

    bool connected() const { return connection_ != nullptr; }
    void connect(portus::DbDeadline deadline) {
        connection_ = connectPostgres(state_->url, state_->policy, deadline);
    }

private:
    std::shared_ptr<PoolState> state_;
};

class PostgresPool final : public portus::DbPool {
public:
    explicit PostgresPool(std::string url) : state_(std::make_shared<PoolState>(std::move(url))) {}

    std::unique_ptr<portus::DbConnection> acquire(portus::DbDeadline deadline) override {
        deadline = std::min(deadline, Clock::now() + state_->policy.acquire_timeout);
        requireTime(deadline);
        auto lease = std::make_unique<Lease>(state_, deadline);
        if (lease->connected()) return lease;

        // libpq may resolve DNS synchronously. Keep its slot reserved until the
        // connector exits, even when the caller's absolute deadline has passed.
        std::packaged_task<std::unique_ptr<Lease>()> connect([lease = std::move(lease), deadline]() mutable {
            lease->connect(deadline);
            return std::move(lease);
        });
        auto result = connect.get_future();
        std::thread(std::move(connect)).detach();
        if (result.wait_until(deadline) != std::future_status::ready)
            throw portus::DbTimeout("PostgreSQL connect deadline expired");
        requireTime(deadline);
        return result.get();
    }

private:
    const std::shared_ptr<PoolState> state_;
};
}
}

namespace actio {
std::unique_ptr<portus::DbPool> makePostgresPool(std::string database_url) {
    if (database_url.size() > db::database_url_limit || database_url.find('\0') != std::string::npos
        || (!database_url.starts_with("postgres://") && !database_url.starts_with("postgresql://")))
        throw std::invalid_argument("DATABASE_URL must be an injected PostgreSQL connection URL");
    return std::make_unique<db::PostgresPool>(std::move(database_url));
}

std::unique_ptr<portus::DbPool> makeInjectedPostgresPool() {
    return makePostgresPool(portus::get_env("DATABASE_URL"));
}
}
