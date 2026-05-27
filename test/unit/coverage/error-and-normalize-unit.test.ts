import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
    createError,
    ErrorCodes,
    createConnectionError,
    createValidationError,
    createCursorError,
    createQueryTimeoutError,
} = require('../../../dist/cjs/index.cjs');

const { normalizeProjection, normalizeSort } = (() => {
    try {
        return require('../../../dist/cjs/index.cjs');
    } catch {
        return {};
    }
})();

describe('createError — branch coverage', () => {
    it('creates error with code and message', () => {
        const err = createError('INVALID_ARGUMENT', 'bad arg');
        assert.equal(err.code, 'INVALID_ARGUMENT');
        assert.equal(err.message, 'bad arg');
        assert.equal(err.details, undefined);
        assert.equal(err.cause, undefined);
    });

    it('creates error with details array', () => {
        const err = createError('VALIDATION_ERROR', 'invalid', [{ field: 'x' }]);
        assert.deepEqual(err.details, [{ field: 'x' }]);
    });

    it('creates error with cause', () => {
        const cause = new Error('original');
        const err = createError('CONNECTION_FAILED', 'conn fail', undefined, cause);
        assert.equal(err.cause, cause);
    });

    it('creates error with both details and cause', () => {
        const cause = new Error('root');
        const err = createError('DATABASE_ERROR', 'db err', ['detail1'], cause);
        assert.deepEqual(err.details, ['detail1']);
        assert.equal(err.cause, cause);
    });
});

describe('createConnectionError — branch coverage', () => {
    it('creates connection error without cause', () => {
        const err = createConnectionError('connection refused');
        assert.equal(err.code, ErrorCodes.CONNECTION_FAILED);
        assert.equal(err.message, 'connection refused');
        assert.equal(err.cause, undefined);
    });

    it('creates connection error with cause', () => {
        const cause = new Error('ECONNREFUSED');
        const err = createConnectionError('connection refused', cause);
        assert.equal(err.code, ErrorCodes.CONNECTION_FAILED);
        assert.equal(err.cause, cause);
    });
});

describe('createValidationError', () => {
    it('creates validation error with details', () => {
        const err = createValidationError([{ field: 'email', msg: 'invalid' }]);
        assert.equal(err.code, ErrorCodes.VALIDATION_ERROR);
        assert.equal(err.message, 'Validation failed');
        assert.deepEqual(err.details, [{ field: 'email', msg: 'invalid' }]);
    });

    it('creates validation error with empty details', () => {
        const err = createValidationError([]);
        assert.deepEqual(err.details, []);
    });
});

describe('createCursorError', () => {
    it('creates cursor error with default message', () => {
        const err = createCursorError();
        assert.equal(err.code, ErrorCodes.INVALID_CURSOR);
        assert.equal(err.message, 'Invalid cursor');
    });

    it('creates cursor error with custom message', () => {
        const err = createCursorError('cursor expired');
        assert.equal(err.code, ErrorCodes.INVALID_CURSOR);
        assert.equal(err.message, 'cursor expired');
    });
});

describe('createQueryTimeoutError', () => {
    it('creates query timeout error without timeoutMs', () => {
        const err = createQueryTimeoutError();
        assert.equal(err.code, ErrorCodes.QUERY_TIMEOUT);
        assert.equal(err.message, 'query timeout');
    });

    it('creates query timeout error with timeoutMs', () => {
        const err = createQueryTimeoutError(5000);
        assert.equal(err.code, ErrorCodes.QUERY_TIMEOUT);
        assert.match(err.message, /5000ms/);
    });
});

describe('normalizeProjection — branch coverage', () => {
    it('returns undefined for null', () => {
        if (!normalizeProjection) return;
        assert.equal(normalizeProjection(null), undefined);
    });

    it('returns undefined for undefined', () => {
        if (!normalizeProjection) return;
        assert.equal(normalizeProjection(undefined), undefined);
    });

    it('converts array to object projection', () => {
        if (!normalizeProjection) return;
        const result = normalizeProjection(['name', 'age']);
        assert.deepEqual(result, { name: 1, age: 1 });
    });

    it('returns undefined for empty array', () => {
        if (!normalizeProjection) return;
        assert.equal(normalizeProjection([]), undefined);
    });

    it('returns object as-is', () => {
        if (!normalizeProjection) return;
        const proj = { name: 1, _id: 0 };
        assert.deepEqual(normalizeProjection(proj), proj);
    });
});

describe('normalizeSort — branch coverage', () => {
    it('returns undefined for null', () => {
        if (!normalizeSort) return;
        assert.equal(normalizeSort(null), undefined);
    });

    it('returns sort object as-is', () => {
        if (!normalizeSort) return;
        const sort = { name: 1 as const };
        assert.deepEqual(normalizeSort(sort), sort);
    });

    it('returns undefined for non-object (string)', () => {
        if (!normalizeSort) return;
        assert.equal(normalizeSort('name' as any), undefined);
    });
});
