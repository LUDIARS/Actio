#include "task_write_input.hpp"
#include "portus/util.hpp"
#include "write_input.hpp"

namespace actio {
namespace {
using portus::Json;

const Json* field(const Json& input, std::string_view name, std::string_view alias = std::string_view()) {
    const auto* value = input.find(name);
    return value || alias.empty() ? value : input.find(alias);
}

void copyText(Json& changes, const Json& input, std::string_view key, bool nullable = true,
              std::string_view alias = std::string_view()) {
    const auto* value = field(input, key, alias);
    if (!value) return;
    if (!validString(*value) && !(nullable && value->is_null()))
        throw WriteError(std::string(key) + " must be a string" + (nullable ? " or null" : ""));
    changes.set(std::string(key), *value);
}

void applyPublicFields(Json& changes, const Json& input) {
    if (const auto* hidden = field(input, "publicHidden", "public_hidden")) {
        if (!hidden->is_bool()) throw WriteError("public_hidden must be a boolean");
        changes.set("publicHidden", *hidden);
    }
    if (const auto* summary = field(input, "publicSummary", "public_summary")) {
        if (!summary->is_null() && !validString(*summary))
            throw WriteError("public_summary must be a string or null");
        const auto trimmed = portus::trim(summary->as_string());
        if (utf16Length(trimmed) > 1000) throw WriteError("public_summary must be at most 1000 characters");
        changes.set("publicSummary", trimmed.empty() ? Json() : Json(trimmed));
    }
}

void applyExecutor(Json& changes, const Json& input, const Json& current) {
    const auto* type = field(input, "executorType", "executor_type");
    const auto* executor = field(input, "aiExecutor", "ai_executor");
    if (!type && !executor) return;
    if (type && *type != Json("human") && *type != Json("ai"))
        throw WriteError("executor_type must be human or ai");
    const auto nextType = type ? *type : current.at("executorType");
    if (executor && !executor->is_null()) {
        const auto& name = executor->as_string();
        constexpr std::string_view allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:/@-";
        if (name.empty() || name.size() > 128 || name.find_first_not_of(allowed) != std::string::npos)
            throw WriteError("ai_executor must be 1-128 characters of letters, digits, '.', '_', ':', '/', '@' or '-'");
        if (nextType != Json("ai")) throw WriteError("ai_executor is only allowed when executor_type is ai");
    }
    changes.set("executorType", nextType == Json("ai") ? Json("ai") : Json("human"));
    if (nextType != Json("ai")) changes.set("aiExecutor", Json());
    else if (executor) changes.set("aiExecutor", *executor);
}

void applyTaskStatus(Json& changes, const Json& input, bool creating) {
    if (const auto* requested = input.find("status")) {
        auto status = requested->as_string();
        if (status == "todo") status = "open";
        if (status == "doing") status = "in_progress";
        if (status != "open" && status != "in_progress" && status != "blocked" && status != "done"
            && status != "cancelled")
            throw WriteError("status must be one of open, in_progress, blocked, done, cancelled (todo/doing 可)");
        changes.set("status", status);
    }
    if (const auto* priority = input.find("priority"); priority && !(creating && priority->is_null())) {
        const auto& value = priority->as_string();
        if (value != "low" && value != "medium" && value != "high" && value != "critical")
            throw WriteError("priority must be one of low, medium, high, critical");
        changes.set("priority", *priority);
    }
}

void applySizing(Json& changes, const Json& input) {
    struct IntegerField {
        const char* key;
        const char* alias;
        int minimum;
        const char* message;
    };
    constexpr IntegerField fields[] = {
        {"durationDays", "duration_days", 1, "duration_days must be a positive integer"},
        {"storyPoints", "story_points", 1, "story_points must be a positive integer"},
        {"estimatedMinutes", "", 0, "estimatedMinutes must be a non-negative integer"}
    };
    for (const auto& spec : fields) {
        if (const auto* value = field(input, spec.key, spec.alias)) {
            if (!value->is_null() && !isInteger(*value, spec.minimum)) throw WriteError(spec.message);
            changes.set(spec.key, *value);
        }
    }
    if (const auto* blocked = field(input, "blockedBy", "blocked_by")) {
        if (!blocked->is_array()) throw WriteError("blocked_by must be an array of task ids");
        for (const auto& item : blocked->items()) {
            if (!validString(item) || item.as_string().empty())
                throw WriteError("blocked_by must be an array of task ids");
        }
        changes.set("blockedBy", *blocked);
    }
}
}

portus::Json taskChanges(const Json& input, const Json& current) {
    const bool creating = current.is_null();
    Json changes = Json::object();
    applyPublicFields(changes, input);
    copyText(changes, input, "title", false);
    if (creating && changes.at("title").as_string().empty()) throw WriteError("title is required");
    applyTaskStatus(changes, input, creating);
    for (const auto* key : {"requirements", "assigneeId", "groupId", "source"})
        copyText(changes, input, key);
    copyText(changes, input, "teamId", true, "team_id");
    copyText(changes, input, "sprintId", true, "sprint_id");
    copyText(changes, input, "sourceRef", true, "source_ref");
    copyText(changes, input, "lane", false);
    constexpr std::pair<const char*, const char*> fields[] = {{"description", "details"}, {"deadline", "due_at"}};
    for (const auto& mapping : fields) {
        const auto* key = mapping.first;
        const auto* alias = mapping.second;
        if (creating && input.at(key).is_null() && input.find(alias)) {
            copyText(changes, Json::object({{key, input.at(alias)}}), key);
        } else {
            copyText(changes, input, key, true, alias);
        }
    }
    if (creating && changes.at("deadline") == Json("")) changes.set("deadline", Json());
    if (const auto* project = field(input, "projectId", "project_id"))
        changes.set("projectId", validString(*project) ? *project : Json());
    if (const auto* category = input.find("category")) {
        const auto trimmed = portus::trim(category->as_string());
        changes.set("category", trimmed.empty() ? Json() : Json(trimmed));
    }
    if (const auto* kind = input.find("kind")) {
        const auto& value = kind->as_string();
        changes.set("kind", value == "goal" || value == "issue" ? *kind : Json("task"));
    }
    if (const auto* creator = input.at("creatorType").is_null() ? input.find("creator_type") : input.find("creatorType"))
        changes.set("creatorType", *creator == Json("ai") ? Json("ai") : Json("human"));
    if (creating) {
        copyText(changes, input, "pluginId");
        copyText(changes, input, "pluginRef");
    }
    if (const auto* payload = input.find("pluginPayload")) changes.set("pluginPayload", *payload);
    applySizing(changes, input);
    applyExecutor(changes, input, creating ? Json::object({{"executorType", "human"}}) : current);
    return changes;
}
}
