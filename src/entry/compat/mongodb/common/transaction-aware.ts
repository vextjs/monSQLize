/**
 * Transaction-awareness utilities for MongoDB session inspection.
 *
 * @internal Used internally by write adapters to detect active transactions.
 */

/**
 * Returns `true` when the given value carries an active MongoDB session that
 * is currently inside a transaction.
 */
function isInTransaction(value: { session?: { inTransaction?: () => boolean; }; } | null | undefined): boolean {
    return !!value?.session?.inTransaction?.();
}

/**
 * Extracts the monSQLize {@link Transaction} object attached to a MongoDB
 * session via `__monSQLizeTransaction`.  Returns `null` when not present.
 */
function getTransactionFromSession<T = unknown>(session: { __monSQLizeTransaction?: T; } | null | undefined): T | null {
    return session?.__monSQLizeTransaction ?? null;
}

export = { isInTransaction, getTransactionFromSession };
