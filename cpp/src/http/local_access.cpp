#include "actio/local_access.hpp"
#include <charconv>
#include <span>
#include <stdexcept>
#include "lorica/byte_view.hpp"
#include "lorica/checked_size.hpp"
#include "lorica/input_budget.hpp"
#include "portus/env.hpp"
#include "portus/url.hpp"
#include "portus/util.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:89a61dfa */
#include "../../contracts/local_access.hpp" /* augur-inject:contract-predicate:dd98ef7f */

namespace actio {
namespace {
constexpr std::size_t header_budget = 16 * 1024;

// Match canonical numeric socket addresses for the loopback subnet.
bool loopback(std::string_view address) {
    if (address == "::1") return true;
    if (address.starts_with("::ffff:")) address.remove_prefix(7);
    if (!address.starts_with("127.")) return false;
    address.remove_prefix(4);
    for (int octet = 0; octet < 3; ++octet) {
        const auto dot = address.find('.');
        if ((dot == std::string_view::npos) != (octet == 2)) return false;
        const auto part = address.substr(0, dot);
        if (part.empty() || part.size() > 3 || (part.size() > 1 && part.front() == '0')) return false;
        unsigned value = 0;
        const auto end = part.data() + part.size();
        const auto result = std::from_chars(part.data(), end, value);
        if (result.ec != std::errc{} || result.ptr != end || value > 255) return false;
        if (dot != std::string_view::npos) address.remove_prefix(dot + 1);
    }
    return true;
}

bool localUrl(const std::string& value) {
    const auto separator = value.find("://");
    if (separator == std::string::npos || value.find('\\') != std::string::npos) return false;
    const auto authority = std::string_view(value).substr(separator + 3);
    if (authority.substr(0, authority.find_first_of("/?#")).find('@') != std::string_view::npos)
        return false;
    portus::Url url;
    return portus::parse_url(value, url) && (url.scheme == "http" || url.scheme == "https")
        && (url.host == "localhost" || loopback(url.host));
}

bool proxyHeader(std::string_view name) {
    return name.starts_with("cf-") || name.starts_with("x-forwarded-") || name == "forwarded"
        || name == "x-real-ip" || name == "via" || name == "true-client-ip";
}

bool boundedDirectHeaders(const portus::Headers& headers) {
    lorica::input_budget budget({header_budget, header_budget, 0, 0});
    for (const auto& [name, value] : headers.all()) {
        const auto size = lorica::checked_add(name.size(), value.size());
        const auto view = std::as_bytes(std::span(value.data(), value.size()));
        const auto bytes = lorica::byte_view::make(view.data(), view.size(), header_budget);
        if (!size || !bytes || !budget.consume(*size, 1, 0) || proxyHeader(name)) return false;
    }
    return true;
}

bool localHost(const portus::Headers& headers) {
    const auto host = headers.get("host");
    return headers.count("host") == 1 && !host.empty()
        && host.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:[-]")
            == std::string::npos && localUrl("http://" + host);
}

bool localBrowserRequest(const portus::Headers& headers) {
    if (headers.count("origin") > 1 || headers.count("sec-fetch-site") > 1
        || headers.count("sec-fetch-mode") > 1) return false;
    const auto* origin = headers.find("origin");
    if (origin && !localUrl(*origin)) return false;
    const auto site = headers.get("sec-fetch-site", "none");
    return (site == "same-origin" || site == "none") && headers.get("sec-fetch-mode") != "no-cors";
}
}

bool allowsLocalOwner(const portus::RequestContext& request) { return ::augur::invoke_observed(::augur::ContractSpec{"C-30", "19b0bf2d", "src/http/local_access.cpp:51"}, actio::contracts::local_access, [&]() -> bool { /* augur-inject:contract-wrap:19b0bf2d */
    return loopback(request.remote_addr) && request.path.starts_with('/')
        && boundedDirectHeaders(request.headers) && localHost(request.headers)
        && localBrowserRequest(request.headers);
}, request); /* augur-inject:contract-end:19b0bf2d */ }

// Keep local mode explicit and refuse settings that conflict with a loopback deployment.
bool readLocalMode() {
    const auto setting = portus::get_env("ACTIO_LOCAL_MODE");
    const auto mode = portus::trim(setting);
    if (mode.empty() || mode == "0") return false;
    if (mode != "1") throw std::invalid_argument("ACTIO_LOCAL_MODE must be 0 or 1");
    if (!portus::get_env("TUNNEL_TOKEN").empty() || !portus::get_env("CLOUDFLARE_TUNNEL_TOKEN").empty())
        throw std::invalid_argument("Actio local mode must not run its own Cloudflare tunnel");
    for (const char* key : {"ACTIO_PUBLIC_URL", "FRONTEND_URL"}) {
        const auto value = portus::get_env(key);
        if (!value.empty() && !localUrl(value))
            throw std::invalid_argument(std::string(key) + " must be loopback in local mode");
    }
    return true;
}
}
