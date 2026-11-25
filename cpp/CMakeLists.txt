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

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../package.json" package_json)
string(JSON actio_version GET "${package_json}" version)
add_executable(actio_backend src/main.cpp)
target_compile_definitions(actio_backend PRIVATE ACTIO_PACKAGE_VERSION=${actio_version})
target_link_libraries(actio_backend PRIVATE actio_health Lorica::boundary)
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
    if(WIN32)
        find_path(ACTIO_LIBPQ_DLL_DIR NAMES libpq.dll HINTS "${PostgreSQL_LIBRARY_DIRS}/../bin" REQUIRED)
        set_tests_properties(actio_postgres_boundary PROPERTIES
            ENVIRONMENT_MODIFICATION "PATH=path_list_prepend:${ACTIO_LIBPQ_DLL_DIR}")
    endif()
endif()
