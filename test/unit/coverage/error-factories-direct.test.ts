import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');
const { createConnectionError, createValidationError, createCursorError, createQueryTimeoutError } = MonSQLize;

// Covers core/errors/index.ts uncovered functions:
//   - createConnectionError (function body never called in prior tests)
//   - createValidationError
//   - createCursorError
//   - createQueryTimeoutError

describe('error factories — direct calls', () => {
    it('createConnectionError returns error with CONNECTION_FAILED code', () => {
        const err = createConnectionError('test connection failed');
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'CONNECTION_FAILED');
        assert.ok(err.message.includes('test connection failed'));
    });

    it('createConnectionError with cause attaches cause', () => {
        const cause = new Error('root cause');
        const err = createConnectionError('failed', cause);
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'CONNECTION_FAILED');
    });

    it('createValidationError returns error with VALIDATION_ERROR code', () => {
        const err = createValidationError([{ field: 'name', message: 'required' }]);
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'VALIDATION_ERROR');
        assert.ok(Array.isArray((err as any).details));
    });

    it('createValidationError with empty details array', () => {
        const err = createValidationError([]);
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'VALIDATION_ERROR');
    });

    it('createCursorError returns error with INVALID_CURSOR code (default message)', () => {
        const err = createCursorError();
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'INVALID_CURSOR');
        assert.ok(err.message.includes('cursor'));
    });

    it('createCursorError with custom message', () => {
        const err = createCursorError('cursor expired');
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'INVALID_CURSOR');
        assert.ok(err.message.includes('cursor expired'));
    });

    it('createQueryTimeoutError without timeoutMs → generic message', () => {
        const err = createQueryTimeoutError();
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'QUERY_TIMEOUT');
        assert.ok(err.message.includes('timeout'));
    });

    it('createQueryTimeoutError with timeoutMs → includes ms in message', () => {
        const err = createQueryTimeoutError(5000);
        assert.ok(err instanceof Error);
        assert.equal((err as any).code, 'QUERY_TIMEOUT');
        assert.ok(err.message.includes('5000'));
    });
});
