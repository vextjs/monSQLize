/**
 * Transaction CJS compat re-export.
 *
 * Exposes Transaction via `module.exports = Transaction` to provide
 * a v1-style require() entry point for backward compatibility with legacy consumers.
 */
import { Transaction } from '../../../capabilities/transaction';

export = Transaction;
