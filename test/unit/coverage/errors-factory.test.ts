import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// ── Error factory functions ───────────────────────────────────────────────────

describe('createConnectionError — factory coverage', () => {
    it('creates error with CONNECTION_FAILED code', () => {
        const err: any = MonSQLize.createConnectionError('Failed to connect');
        assert.equal(err.code, 'CONNECTION_FAILED');
        assert.equal(err.message, 'Failed to connect');
        assert.ok(err instanceof Error);
    });

    it('creates error with cause attached', () => {
        const cause = new Error('underlying cause');
        const err: any = MonSQLize.createConnectionError('Connection timeout', cause);
        assert.equal(err.code, 'CONNECTION_FAILED');
        assert.ok(err.cause === cause || err.cause?.message === cause.message);
    });

    it('creates error without cause', () => {
        const err: any = MonSQLize.createConnectionError('no cause');
        assert.equal(err.code, 'CONNECTION_FAILED');
        assert.equal(err.cause, undefined);
    });
});

describe('createValidationError — factory coverage', () => {
    it('creates error with VALIDATION_ERROR code', () => {
        const err: any = MonSQLize.createValidationError([{ field: 'name', message: 'required' }]);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.message, 'Validation failed');
        assert.ok(err instanceof Error);
    });

    it('details array is attached', () => {
        const details = [{ path: 'email', message: 'invalid format' }, { path: 'age', message: 'must be number' }];
        const err: any = MonSQLize.createValidationError(details);
        assert.ok(Array.isArray(err.details));
        assert.equal(err.details.length, 2);
    });

    it('creates error with empty details array', () => {
        const err: any = MonSQLize.createValidationError([]);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.deepEqual(err.details, []);
    });
});

describe('createCursorError — factory coverage', () => {
    it('creates error with INVALID_CURSOR code and default message', () => {
        const err: any = MonSQLize.createCursorError();
        assert.equal(err.code, 'INVALID_CURSOR');
        assert.equal(err.message, 'Invalid cursor');
        assert.ok(err instanceof Error);
    });

    it('creates error with custom message', () => {
        const err: any = MonSQLize.createCursorError('Cursor expired');
        assert.equal(err.code, 'INVALID_CURSOR');
        assert.equal(err.message, 'Cursor expired');
    });

    it('creates error with empty string message uses default', () => {
        const err: any = MonSQLize.createCursorError('');
        assert.equal(err.code, 'INVALID_CURSOR');
    });
});

describe('createQueryTimeoutError — factory coverage', () => {
    it('creates error with QUERY_TIMEOUT code and default message', () => {
        const err: any = MonSQLize.createQueryTimeoutError();
        assert.equal(err.code, 'QUERY_TIMEOUT');
        assert.equal(err.message, 'query timeout');
        assert.ok(err instanceof Error);
    });

    it('creates error with timeout in ms included in message', () => {
        const err: any = MonSQLize.createQueryTimeoutError(5000);
        assert.equal(err.code, 'QUERY_TIMEOUT');
        assert.ok(err.message.includes('5000'));
        assert.ok(err.message.includes('ms'));
    });

    it('creates error with 0ms timeout', () => {
        const err: any = MonSQLize.createQueryTimeoutError(0);
        assert.equal(err.code, 'QUERY_TIMEOUT');
        assert.ok(err.message.includes('0ms'));
    });
});

describe('createError — branch coverage', () => {
    it('creates error with details when provided', () => {
        const err: any = MonSQLize.createError('CUSTOM_CODE', 'custom message', ['detail1', 'detail2']);
        assert.equal(err.code, 'CUSTOM_CODE');
        assert.deepEqual(err.details, ['detail1', 'detail2']);
    });

    it('creates error without details when undefined', () => {
        const err: any = MonSQLize.createError('CUSTOM_CODE', 'message');
        assert.equal(err.code, 'CUSTOM_CODE');
        assert.equal(err.details, undefined);
    });

    it('creates error with cause when provided', () => {
        const cause = new Error('root cause');
        const err: any = MonSQLize.createError('CUSTOM_CODE', 'message', undefined, cause);
        assert.ok(err.cause === cause || err.cause?.message === 'root cause');
    });

    it('creates error without cause when undefined', () => {
        const err: any = MonSQLize.createError('CUSTOM_CODE', 'message', undefined, undefined);
        assert.equal(err.cause, undefined);
    });
});
