#include "write_body.hpp"
#include <span>
#include "lorica/byte_view.hpp"
#include "portus/db.hpp"
#include "portus/util.hpp"
#include "write_input.hpp"

namespace actio {
namespace {
bool validDocument(const portus::Json& value) {
    if (value.is_string()) return validString(value);
    for (const auto& entry : value.items()) {
        if (!validDocument(entry)) return false;
    }
    for (const auto& [key, entry] : value.members()) {
        if (key.contains('\0') || !validDocument(entry)) return false;
    }
    return true;
}
}

portus::Json parseWriteBody(std::string_view body) {
    const auto bytes = std::as_bytes(std::span(body.data(), body.size()));
    if (!lorica::byte_view::make(bytes.data(), bytes.size(), portus::db_max_value_bytes))
        throw WriteError("Request body is too large", 413);
    if (!portus::utf8_valid(body)) throw WriteError("Invalid JSON body");
    try {
        auto parsed = portus::Json::parse(body, 32);
        if (!parsed.is_object() || !validDocument(parsed)) throw WriteError("Invalid JSON body");
        return parsed;
    } catch (const portus::JsonError&) {
        throw WriteError("Invalid JSON body");
    }
}
}
