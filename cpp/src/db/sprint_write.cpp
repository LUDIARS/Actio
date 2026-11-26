#include "sprint_write.hpp"
#include "actio/local_owner.hpp"
#include "portus/id.hpp"
#include "planning_lock.hpp"
#include "sprint_projection.hpp"
#include "sprint_write_input.hpp"
#include "task_write_rules.hpp"
#include "write_input.hpp"
#include "write_transaction.hpp"
#include "augur/contract_runtime.hpp" /* augur-inject:import:fb59856d */
#include "../../contracts/sprint_create.hpp" /* augur-inject:contract-predicate:a85ec6c0 */
#include "../../contracts/sprint_change.hpp" /* augur-inject:contract-predicate:a1ddff3b */

namespace actio {
namespace {
using portus::Json;
using portus::DbConnection;
using portus::DbDeadline;

void ensureNoOverlap(DbConnection& connection, DbDeadline deadline, std::string_view team,
                     std::string_view id, const std::string& start, const std::string& end) {
    const auto rows = connection.query({R"sql(
        SELECT name FROM sprints
        WHERE team_id = $1 AND id <> $2 AND status <> 'closed' AND starts_on <= $3 AND ends_on >= $4
        ORDER BY starts_on, id LIMIT 1
        )sql", {team, id, end, start}, 1}, deadline);
    if (!rows.empty())
        throw WriteError("「" + rows.front().at(0).value() + "」と期間が重なります。後続スプリントもリスケしてください", 409);
}

Json findSprint(DbConnection& connection, DbDeadline deadline, std::string_view team, std::string_view id) {
    const auto sql = "SELECT " + std::string(sprintDocument)
        + " FROM sprints WHERE team_id = $1 AND id = $2 FOR UPDATE";
    const auto rows = connection.query({sql, {team, id}, 1}, deadline);
    if (rows.empty()) throw WriteError("スプリントが見つかりません", 404);
    return Json::parse(rows.front().at(0).value());
}

void recordChange(DbConnection& connection, DbDeadline deadline, std::string_view sprint,
                  std::string_view kind, std::string_view reason, const Json& before, const Json& after) {
    const auto id = portus::uuidv4();
    const auto oldDocument = before.dump();
    const auto newDocument = after.dump();
    connection.query({R"sql(
        INSERT INTO sprint_changes(id,sprint_id,kind,actor_id,reason,before_json,after_json,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        )sql", {id, sprint, kind, local_owner_id, reason, oldDocument, newDocument}, 0}, deadline);
}

void changeGoal(DbConnection& connection, DbDeadline deadline, const Json& sprint, const Json& change) {
    const auto& id = sprint.at("id").as_string();
    const auto& team = sprint.at("teamId").as_string();
    if (sprint.at("status") != Json("planning")) {
        const auto rows = connection.query({
            "SELECT state_json FROM sprint_gates WHERE team_id = $1 AND sprint_id = $2", {team, id}, 1
        }, deadline);
        const bool editable = sprint.at("status") == Json("active") && (rows.empty()
            || Json::parse(rows.front().at(0).value()).at("phase") == Json("implementation"));
        if (!editable)
            throw WriteError("受入確認以降のゴール変更は、フェーズ画面で差し戻してから行ってください", 409);
    }
    connection.query({"UPDATE sprints SET goal = $1 WHERE id = $2",
                      {change.at("goal").as_string(), id}, 0}, deadline);
}

void changeDates(DbConnection& connection, DbDeadline deadline, const Json& sprint, const Json& change) {
    const auto& id = sprint.at("id").as_string();
    const auto& team = sprint.at("teamId").as_string();
    const auto& end = change.at("endsOn").as_string();
    if (change.at("action") == Json("extend")) {
        if (end <= sprint.at("endsOn").as_string())
            throw WriteError("現在の締め切りより後の日付を指定してください");
        if (end > sprint.at("bufferEndsOn").as_string())
            throw WriteError("バッファ上限を超えます。リスケで開始日・締め切り・バッファを見直してください", 409);
        ensureNoOverlap(connection, deadline, team, id, sprint.at("startsOn").as_string(), end);
        connection.query({"UPDATE sprints SET ends_on = $1 WHERE id = $2", {end, id}, 0}, deadline);
        return;
    }
    const auto& start = change.at("startsOn").as_string();
    if (sprint.at("status") == Json("active") && change.at("startsOn") != sprint.at("startsOn"))
        throw WriteError("開始済みスプリントの開始日は変更できません");
    ensureNoOverlap(connection, deadline, team, id, start, end);
    const auto cadence = change.at("cadenceDays").dump();
    const auto capacity = change.at("capacityMinutes").dump();
    const portus::DbText capacityParam = change.at("capacityMinutes").is_null()
        ? portus::DbText{} : portus::DbText{capacity};
    connection.query({R"sql(
        UPDATE sprints SET starts_on = $1, ends_on = $2, buffer_ends_on = $3, cadence_days = $4, capacity_minutes = $5
        WHERE id = $6
        )sql", {start, end, change.at("bufferEndsOn").as_string(), cadence, capacityParam, id}, 0}, deadline);
}

void changeAssignment(DbConnection& connection, DbDeadline deadline, const Json& sprint, const Json& change) {
    const auto& id = sprint.at("id").as_string();
    const auto& team = sprint.at("teamId").as_string();
    const auto& taskId = change.at("taskId").as_string();
    lockTaskWrites(connection, deadline);
    const auto rows = connection.query({R"sql(
        SELECT sprint_id, status, assignee_id FROM tasks
        WHERE id = $1 AND team_id = $2 AND lane = 'backlog' FOR UPDATE
        )sql", {taskId, team}, 1}, deadline);
    if (rows.empty()) throw WriteError("同じチームのバックログを選んでください");
    const auto& row = rows.front();
    const bool assigning = change.at("action") == Json("assign");
    if (assigning) {
        if (row.at(0)) throw WriteError("割付済みのタスクです。先に現在のスプリントから戻してください", 409);
        if (row.at(1) == "done" || row.at(1) == "cancelled")
            throw WriteError("完了済みタスクは割り付けられません");
        if (!row.at(2) || !validTaskAssignee(connection, deadline, team, row.at(2).value()))
            throw WriteError("有効なチーム担当者を設定してください");
    } else if (row.at(0) != id) {
        throw WriteError("このスプリントに所属していません");
    }
    const auto member = assigning ? portus::DbText{id} : portus::DbText{};
    connection.query({
        "UPDATE tasks SET sprint_id = $1, updated_at = date_trunc('milliseconds', now() AT TIME ZONE 'UTC') WHERE id = $2",
        {member, taskId}, 0
    }, deadline);
}
}

Json createSprint(DbConnection& connection, DbDeadline deadline, std::string_view team, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-35", "7c4360b8", "src/db/sprint_write.cpp:124"}, actio::contracts::sprint_create, [&]() -> Json { /* augur-inject:contract-wrap:7c4360b8 */
    return inWriteTransaction(connection, deadline, [&] {
        lockTeamPlan(connection, deadline, team);
        const auto values = newSprintInput(input);
        ensureNoOverlap(connection, deadline, team, "", values.at("startsOn").as_string(),
                        values.at("endsOn").as_string());
        const auto id = portus::uuidv4();
        const auto sql = R"sql(
            INSERT INTO sprints(id,team_id,name,goal,starts_on,ends_on,original_ends_on,cadence_days,
                buffer_ends_on,status,capacity_minutes,created_by,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,'planning',$9,$10,now(),now())
            RETURNING )sql" + std::string(sprintDocument);
        const auto cadence = values.at("cadenceDays").dump();
        const auto capacity = values.at("capacityMinutes").dump();
        const portus::DbText capacityParam = values.at("capacityMinutes").is_null()
            ? portus::DbText{} : portus::DbText{capacity};
        const auto rows = connection.query({
            sql, {id, team, values.at("name").as_string(), values.at("goal").as_string(),
                values.at("startsOn").as_string(), values.at("endsOn").as_string(), cadence,
                values.at("bufferEndsOn").as_string(), capacityParam, local_owner_id}, 1
        }, deadline);
        const auto sprint = Json::parse(rows.at(0).at(0).value());
        recordChange(connection, deadline, id, "create", "初期計画", Json::object(), sprint);
        return sprint;
    });
}, connection, deadline, team, input); /* augur-inject:contract-end:7c4360b8 */ }

Json changeSprint(DbConnection& connection, DbDeadline deadline, std::string_view team,
                  std::string_view id, const Json& input) { return ::augur::invoke_observed(::augur::ContractSpec{"C-36", "3b758c98", "src/db/sprint_write.cpp:151"}, actio::contracts::sprint_change, [&]() -> Json { /* augur-inject:contract-wrap:3b758c98 */
    return inWriteTransaction(connection, deadline, [&] {
        lockTeamPlan(connection, deadline, team);
        const auto change = sprintChangeInput(input);
        const auto before = findSprint(connection, deadline, team, id);
        if (before.at("revision") != change.at("revision"))
            throw WriteError("計画が変更されています。再読み込みしてください", 409);
        if (before.at("status") == Json("closed"))
            throw WriteError("終了したスプリントは変更できません", 409);
        const auto& action = change.at("action").as_string();
        if (action == "start" || action == "close")
            throw WriteError("フェーズ画面で計画・受入・振り返り・次計画を確認してください。直接の開始・終了はできません", 409);
        if (action == "update_goal") changeGoal(connection, deadline, before, change);
        else if (action == "extend" || action == "reschedule") changeDates(connection, deadline, before, change);
        else changeAssignment(connection, deadline, before, change);
        const auto sql = "UPDATE sprints SET revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING "
            + std::string(sprintDocument);
        const auto rows = connection.query({sql, {id}, 1}, deadline);
        auto after = Json::parse(rows.at(0).at(0).value());
        recordChange(connection, deadline, id, action, change.at("reason").as_string(), before,
                     Json::object({{"sprint", after}, {"input", change}}));
        return after;
    });
}, connection, deadline, team, id, input); /* augur-inject:contract-end:3b758c98 */ }
}
