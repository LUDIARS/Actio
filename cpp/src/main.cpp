#include <charconv>
#include <cstdio>
#include <stdexcept>
#include "actio/liveness.hpp"
#include "lorica/byte_view.hpp"
#include "portus/env.hpp"
#include "portus/http.hpp"
#include "portus/util.hpp"

#define ACTIO_STRINGIFY_IMPL(value) #value
#define ACTIO_STRINGIFY(value) ACTIO_STRINGIFY_IMPL(value)

namespace {
int listenPort(const std::string& value) {
    int port = 0;
    const auto bytes = lorica::byte_view::make(
        reinterpret_cast<const std::byte*>(value.data()), value.size(), 5);
    if (bytes) {
        const char* end = value.data() + bytes->size();
        const auto parsed = std::from_chars(value.data(), end, port);
        if (parsed.ec == std::errc{} && parsed.ptr == end && port >= 1 && port <= 65535)
            return port;
    }
    throw std::invalid_argument("ACTIO_PORT must be a port between 1 and 65535");
}
}

int main() try {
    const int port = listenPort(portus::get_env("ACTIO_PORT"));
    const std::string injected = portus::get_env("EXCUBITOR_SERVICE_VERSION");
    const auto trimmed = portus::trim(injected);
    const std::string version(trimmed.empty() ? ACTIO_STRINGIFY(ACTIO_PACKAGE_VERSION) : trimmed);
    portus::EventLoop loop;
    portus::HttpServerOptions options;
    options.allowed_hosts = {"localhost", "127.0.0.1"};
    options.routes.emplace_back("GET", "/api/health/live",
        [version](portus::RequestContext&) {
            return portus::json(actio::liveStatus(version, portus::now_ms()));
        });
    portus::HttpServer server(loop, std::move(options));
    server.listen(port, "127.0.0.1");
    loop.run();
    return 0;
} catch (const std::exception& error) {
    std::fprintf(stderr, "Actio startup failed: %s\n", error.what());
    return 1;
}
