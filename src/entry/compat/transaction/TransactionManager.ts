/**
 * TransactionManager CJS compat re-export.
 *
 * Exposes TransactionManager via `module.exports = TransactionManager` to provide
 * a v1-style require() entry point for backward compatibility with legacy consumers.
 */
import { TransactionManager } from '../../../capabilities/transaction';

export = TransactionManager;
