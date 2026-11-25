#pragma once
#include "portus/db.hpp"

namespace actio {
// Acquire the table write lock before row locks. Phase transitions lock the same table.
inline void lockTaskWrites(portus::DbConnection& connection, portus::DbDeadline deadline) {
    connection.query({"LOCK TABLE tasks IN ROW EXCLUSIVE MODE", {}, 0}, deadline);
}

// Commit after the operation returns, or roll back before propagating its failure.
template<class Operation>
auto inWriteTransaction(portus::DbConnection& connection, portus::DbDeadline deadline,
                        Operation operation) {
    connection.begin(deadline);
    try {
        auto result = operation();
        connection.commit(deadline);
        return result;
    } catch (...) {
        // Preserve the original failure. The pool discards a lease left in a transaction.
        try { connection.rollback(deadline); } catch (...) {}
        throw;
    }
}
}
