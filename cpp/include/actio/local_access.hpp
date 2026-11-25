#pragma once
#include "portus/http.hpp"

namespace actio {
// Determine ownership from the direct socket and request headers.
bool allowsLocalOwner(const portus::RequestContext& request);
// Read and validate the injected settings for the loopback candidate.
bool readLocalMode();
}
