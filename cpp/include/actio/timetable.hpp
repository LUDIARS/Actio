#pragma once
#include "portus/http.hpp"

namespace actio {
// Add the database-independent timetable endpoint.
void addTimetableRoute(portus::HttpServerOptions& options);
}
