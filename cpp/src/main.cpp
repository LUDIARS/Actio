#include <charconv>
#include <cstdio>
#include <span>
#include <stdexcept>
#include "actio/concordia_routes.hpp"
#include "actio/liveness.hpp"
#include "actio/local_access.hpp"
#include "actio/postgres.hpp"
#include "actio/timetable.hpp"
#include "lorica/byte_view.hpp"
#include "portus/env.hpp"
#include "portus/http.hpp"
#include "portus/util.hpp"

#define ACTIO_STRINGIFY_IMPL(value) #value
#define ACTIO_STRINGIFY(value) ACTIO_STRINGIFY_IMPL(value)

namespace {
int listenPort(const std::string& value) {
    const auto view = std::as_bytes(std::span(value.data(), value.size()));
    const auto bytes = lorica::byte_view::make(view.data(), view.size(), 5);
    if (bytes) {
        int port = 0;
        const char* end = value.data() + bytes->size();
        const auto parsed = std::from_chars(value.data(), end, port);
        if (parsed.ec == std::errc{} && parsed.ptr == end && port >= 1 && port <= 65535)
            return port;
    }
    throw std::invalid_argument("ACTIO_PORT must be a port between 1 and 65535");
}
}

int main() try {
    const std::string injected = portus::get_env("EXCUBITOR_SERVICE_VERSION");
    const auto trimmed = portus::trim(injected);
    const std::string version(trimmed.empty() ? ACTIO_STRINGIFY(ACTIO_PACKAGE_VERSION) : trimmed);
    portus::HttpServerOptions options;
    options.allowed_hosts = {"localhost", "127.0.0.1", "[::1]"};
    options.routes.emplace_back("GET", "/api/health/live",
        [version](portus::RequestContext&) {
            return portus::json(actio::liveStatus(version, portus::now_ms()));
        });
    const bool localMode = actio::readLocalMode();
    std::shared_ptr<portus::DbPool> pool;
    if (localMode) {
        auto databaseUrl = portus::get_env("DATABASE_URL");
        if (!databaseUrl.empty()) pool = actio::makePostgresPool(std::move(databaseUrl));
    }
    actio::addConcordiaReadRoutes(options, localMode, std::move(pool));
    actio::addTimetableRoute(options);
    const int port = listenPort(portus::get_env("ACTIO_PORT"));
    portus::EventLoop loop;
    portus::HttpServer server(loop, std::move(options));
    server.listen(port, "127.0.0.1");
    loop.run();
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "Actio startup failed: %s\n", error.what());
    return 1;
}
