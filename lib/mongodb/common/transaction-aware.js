"use strict";

// src/entry/compat/mongodb/common/transaction-aware.ts
function isInTransaction(value) {
  return !!value?.session?.inTransaction?.();
}
function getTransactionFromSession(session) {
  return session?.__monSQLizeTransaction ?? null;
}
module.exports = { isInTransaction, getTransactionFromSession };
