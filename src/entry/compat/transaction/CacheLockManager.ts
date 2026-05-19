/**
 * CacheLockManager CJS compat re-export.
 *
 * Exposes CacheLockManager via `module.exports = CacheLockManager` to provide
 * a v1-style require() entry point for backward compatibility with legacy consumers.
 */
import { CacheLockManager } from '../../../capabilities/transaction';

export = CacheLockManager;
