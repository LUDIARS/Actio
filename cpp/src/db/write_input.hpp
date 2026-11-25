#pragma once
#include <cmath>
#include <limits>
#include "portus/json.hpp"

namespace actio {
// A domain rejection whose status and message are safe to return to the caller.
class WriteError : public std::runtime_error {
public:
    // Default to an invalid-input response.
    WriteError(const std::string& message, int status = 400)
        : std::runtime_error(message), status(status) {}
    const int status;
};

// Accept only integral JSON numbers within the target PostgreSQL integer range.
inline bool isInteger(const portus::Json& value, int min,
                      int max = std::numeric_limits<int>::max()) {
    if (!value.is_number()) return false;
    const auto n = value.as_number();
    return n >= min && n <= max && std::trunc(n) == n;
}

// Text values submitted to PostgreSQL cannot contain embedded NUL.
inline bool validString(const portus::Json& value) {
    return value.is_string() && !value.as_string().contains('\0');
}

// JavaScript's string length counts UTF-16 code units. The HTTP parser checks UTF-8 first.
inline std::size_t utf16Length(std::string_view utf8) {
    std::size_t size = 0;
    for (const unsigned char byte : utf8) {
        if ((byte & 0xc0) != 0x80) size += byte >= 0xf0 ? 2 : 1;
    }
    return size;
}
}
