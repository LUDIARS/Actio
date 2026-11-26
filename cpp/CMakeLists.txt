cmake_minimum_required(VERSION 4.2)
project(actio_backend LANGUAGES CXX)
find_package(Lorica CONFIG REQUIRED COMPONENTS boundary)
find_package(PostgreSQL REQUIRED)
find_package(Threads REQUIRED)

set(PORTUS_SOURCE_DIR "" CACHE PATH "Path to the Portus cpp source distribution")
if(NOT EXISTS "${PORTUS_SOURCE_DIR}/include/portus/db.hpp")
    message(FATAL_ERROR "Set PORTUS_SOURCE_DIR to the Portus cpp directory with portus/db.hpp")
endif()
set(PORTUS_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(PORTUS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
add_subdirectory("${PORTUS_SOURCE_DIR}" portus-build EXCLUDE_FROM_ALL)

add_library(actio_health STATIC src/liveness.cpp)
target_compile_features(actio_health PUBLIC cxx_std_23)
target_include_directories(actio_health PUBLIC include)
target_link_libraries(actio_health PUBLIC portus::portus)
lorica_harden_target(actio_health)

add_library(actio_postgres STATIC
    src/db/postgres_policy.cpp
    src/db/postgres_wire.cpp
    src/db/postgres_connection.cpp
    src/db/postgres_pool.cpp)
target_compile_features(actio_postgres PUBLIC cxx_std_23)
target_include_directories(actio_postgres PUBLIC include PRIVATE src/db contracts)
target_link_libraries(actio_postgres PUBLIC portus::portus
    PRIVATE PostgreSQL::PostgreSQL Lorica::boundary Threads::Threads)
if(WIN32)
    target_link_libraries(actio_postgres PRIVATE ws2_32)
endif()
lorica_harden_target(actio_postgres)

add_library(actio_concordia_http STATIC
    src/db/backlog_plan.cpp
    src/db/pm_critical_path.cpp
    src/db/pm_project_read.cpp
    src/db/sprint_write.cpp
    src/db/sprint_write_input.cpp
    src/db/task_categories.cpp
    src/db/task_cursor.cpp
    src/db/task_critical_path.cpp
    src/db/task_delete.cpp
    src/db/task_list_query.cpp
    src/db/task_projection.cpp
    src/db/task_read.cpp
    src/db/task_read_sql.cpp
    src/db/task_sprint_view.cpp
    src/db/task_notifications.cpp
    src/db/task_write.cpp
    src/db/task_write_input.cpp
    src/db/task_write_rules.cpp
    src/db/team_admin.cpp
    src/db/team_settings.cpp
    src/http/local_access.cpp
    src/http/local_owner.cpp
    src/http/concordia_catalog.cpp
    src/http/concordia_routes.cpp
    src/http/timetable.cpp
    src/http/write_body.cpp)
if(MSVC)
    target_compile_options(actio_concordia_http PRIVATE /utf-8)
endif()
target_compile_features(actio_concordia_http PUBLIC cxx_std_23)
target_include_directories(actio_concordia_http PUBLIC include PRIVATE contracts src/db src/http)
target_link_libraries(actio_concordia_http PUBLIC portus::portus PRIVATE Lorica::boundary)
lorica_harden_target(actio_concordia_http)

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../package.json" package_json)
string(JSON actio_version GET "${package_json}" version)
add_executable(actio_backend src/main.cpp)
target_compile_definitions(actio_backend PRIVATE ACTIO_PACKAGE_VERSION=${actio_version})
target_link_libraries(actio_backend PRIVATE actio_health actio_concordia_http actio_postgres Lorica::boundary)
lorica_harden_target(actio_backend)

include(CTest)
if(BUILD_TESTING)
    add_executable(actio_health_test tests/liveness.cpp)
    target_link_libraries(actio_health_test PRIVATE actio_health)
    lorica_harden_target(actio_health_test)
    add_test(NAME actio_health_response COMMAND actio_health_test)

    add_executable(actio_postgres_test tests/postgres.cpp)
    target_include_directories(actio_postgres_test PRIVATE src/db)
    target_link_libraries(actio_postgres_test PRIVATE actio_postgres PostgreSQL::PostgreSQL)
    lorica_harden_target(actio_postgres_test)
    add_test(NAME actio_postgres_boundary COMMAND actio_postgres_test)
    add_executable(actio_concordia_http_test tests/concordia_http.cpp)
    target_link_libraries(actio_concordia_http_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_concordia_http_test)
    add_test(NAME actio_concordia_http_boundary COMMAND actio_concordia_http_test)
    add_executable(actio_task_read_test tests/task_read.cpp)
    target_link_libraries(actio_task_read_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_task_read_test)
    add_test(NAME actio_task_read_boundary COMMAND actio_task_read_test)
    add_executable(actio_task_write_test tests/task_write.cpp)
    target_link_libraries(actio_task_write_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_task_write_test)
    add_test(NAME actio_task_write_boundary COMMAND actio_task_write_test)
    add_executable(actio_team_critical_path_test tests/team_critical_path.cpp)
    target_link_libraries(actio_team_critical_path_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_team_critical_path_test)
    add_test(NAME actio_team_critical_path_boundary COMMAND actio_team_critical_path_test)
    add_executable(actio_stage5_http_test tests/stage5_http.cpp)
    target_link_libraries(actio_stage5_http_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_stage5_http_test)
    add_test(NAME actio_stage5_http_boundary COMMAND actio_stage5_http_test)
    add_executable(actio_task_organization_test tests/task_organization.cpp)
    target_link_libraries(actio_task_organization_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_task_organization_test)
    add_test(NAME actio_task_organization_boundary COMMAND actio_task_organization_test)
    add_executable(actio_team_admin_test tests/team_admin.cpp)
    target_link_libraries(actio_team_admin_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_team_admin_test)
    add_test(NAME actio_team_admin_boundary COMMAND actio_team_admin_test)
    add_executable(actio_backlog_plan_test tests/backlog_plan.cpp)
    target_link_libraries(actio_backlog_plan_test PRIVATE actio_concordia_http)
    lorica_harden_target(actio_backlog_plan_test)
    add_test(NAME actio_backlog_plan_boundary COMMAND actio_backlog_plan_test)
    if(WIN32)
        find_path(ACTIO_LIBPQ_DLL_DIR NAMES libpq.dll HINTS "${PostgreSQL_LIBRARY_DIRS}/../bin" REQUIRED)
        set_tests_properties(actio_postgres_boundary PROPERTIES
            ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${ACTIO_LIBPQ_DLL_DIR}")
    endif()
endif()
