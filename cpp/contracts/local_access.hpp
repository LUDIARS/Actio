#pragma once
#include "augur/contract_runtime.hpp"
#include "portus/http.hpp"

namespace actio::contracts {
inline const auto local_access = augur::post_only(
    [](bool allowed, const portus::RequestContext& request) {
        if (!allowed) return true;
        const auto& headers = request.headers;
        const auto site = headers.get("sec-fetch-site", "none");
        if (request.remote_addr.empty() || headers.count("host") != 1
            || (site != "none" && site != "same-origin")
            || headers.get("sec-fetch-mode") == "no-cors") return false;
        for (const auto& header : headers.all()) {
            const auto& name = header.first;
            if (name.starts_with("cf-") || name.starts_with("x-forwarded-")
                || name == "forwarded" || name == "x-real-ip"
                || name == "via" || name == "true-client-ip") return false;
        }
        return true;
    });
}
