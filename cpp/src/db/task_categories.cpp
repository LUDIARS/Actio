#include "task_categories.hpp"
#include <algorithm>
#include "actio/local_owner.hpp"
#include "write_input.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:69b94abb */
#include "../../contracts/task_categories_contract.hpp" /* augur-inject:contract-predicate:13d516de */

namespace actio {
namespace {
using portus::DbConnection;
using portus::DbDeadline;
using portus::Json;

constexpr std::string_view preference = "task.categories.registered";
// Match ECMAScript String.trim for both submitted names and stored task labels.
constexpr std::string_view whitespace =
    " \t\r\n\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007"
    "\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

Json readRegistered(DbConnection& connection, DbDeadline deadline) {
    const auto rows = connection.query({
        "SELECT value FROM user_preferences WHERE user_id = $1 AND key = $2",
        {local_owner_id, preference}, 1
    }, deadline);
    if (rows.empty() || !rows.front().at(0)) return Json::array();
    try {
        auto result = Json::array();
        const auto stored = Json::parse(*rows.front().at(0));
        for (const auto& item : stored.items()) {
            if (validString(item)) result.push_back(item);
        }
        return result;
    } catch (const portus::JsonError&) {
        // Old preference values can contain malformed JSON. Node treats them as empty.
        return Json::array();
    }
}

std::string categoryName(DbConnection& connection, DbDeadline deadline, std::string_view raw) {
    if (raw.contains('\0')) throw WriteError("Invalid category name");
    const auto rows = connection.query({
        "SELECT btrim($1, $2)", {raw, whitespace}, 1
    }, deadline);
    return rows.at(0).at(0).value();
}

void saveRegistered(DbConnection& connection, DbDeadline deadline, const Json& registered) {
    const auto encoded = registered.dump();
    connection.query({R"sql(
        INSERT INTO user_preferences (user_id, key, value, updated_at)
        VALUES ($1, $2, $3, statement_timestamp() AT TIME ZONE 'UTC')
        ON CONFLICT (user_id, key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
        )sql", {local_owner_id, preference, encoded}, 0}, deadline);
}

Json changeRegistration(DbConnection& connection, DbDeadline deadline, std::string_view raw, bool add) {
    const auto name = categoryName(connection, deadline, raw);
    if (name.empty()) {
        if (add) throw WriteError("name required");
        return readTaskCategories(connection, deadline);
    }
    return inWriteTransaction(connection, deadline, [&] {
        // The owner row exists before routing here and serializes even the first registration.
        connection.query({"SELECT id FROM users WHERE id = $1 FOR UPDATE", {local_owner_id}, 1}, deadline);
        auto registered = Json::Array(readRegistered(connection, deadline).items());
        if (add) {
            if (std::ranges::find(registered, Json(name)) != registered.end())
                return readTaskCategories(connection, deadline);
            registered.emplace_back(name);
        } else {
            std::erase(registered, Json(name));
        }
        saveRegistered(connection, deadline, Json(std::move(registered)));
        return readTaskCategories(connection, deadline);
    });
}
}

Json readTaskCategories(DbConnection& connection, DbDeadline deadline) { return ::augur::invoke_observed(::augur::ContractSpec{"C-42", "6686ed77", "src/db/task_categories.cpp:83"}, actio::contracts::task_categories, [&]() -> Json { /* augur-inject:contract-wrap:6686ed77 */
    const auto registered = readRegistered(connection, deadline).dump();
    const auto rows = connection.query({R"sql(
        SELECT coalesce(json_agg(label ORDER BY label), '[]'::json)
        FROM (
            SELECT btrim(parts.label, $2) AS label
            FROM tasks CROSS JOIN LATERAL unnest(string_to_array(category, ',')) AS parts(label)
            WHERE owner_id = $1 AND status IN ('open', 'in_progress', 'todo', 'doing')
            AND btrim(parts.label, $2) <> ''
            UNION
            SELECT value FROM json_array_elements_text($3::json)
        ) AS categories
        )sql", {local_owner_id, whitespace, registered}, 1}, deadline);
    return Json::object({{"items", Json::parse(rows.at(0).at(0).value())}});
}, connection, deadline); /* augur-inject:contract-end:6686ed77 */ }

Json registerTaskCategory(DbConnection& connection, DbDeadline deadline, const Json& input) {
    const auto& name = input.at("name");
    if (!validString(name) || name.as_string().empty()) throw WriteError("name required");
    return changeRegistration(connection, deadline, name.as_string(), true);
}

Json unregisterTaskCategory(DbConnection& connection, DbDeadline deadline, std::string_view name) {
    return changeRegistration(connection, deadline, name, false);
}
}
