#include "actio/liveness.hpp"

int main() {
    const auto body = actio::liveStatus("release-a", 123);
    return body.at("status").as_string() == "ok"
        && body.at("service").as_string() == "actio"
        && body.at("version").as_string() == "release-a"
        && body.at("timestamp").as_string() == "1970-01-01T00:00:00.123Z" ? 0 : 1;
}
