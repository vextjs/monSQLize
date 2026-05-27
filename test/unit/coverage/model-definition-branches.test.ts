import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Clear the model registry between tests to avoid MODEL_ALREADY_EXISTS errors
// and to prevent cross-test pollution.
beforeEach(() => {
    MonSQLize.Model._clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// validateCollectionName branches
// ─────────────────────────────────────────────────────────────────────────────

describe('validateCollectionName — branches', () => {

    it('throws INVALID_COLLECTION_NAME for empty string', () => {
        assert.throws(
            () => MonSQLize.Model.define('', { schema: {} }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_COLLECTION_NAME',
        );
    });

    it('throws INVALID_COLLECTION_NAME for whitespace-only string', () => {
        assert.throws(
            () => MonSQLize.Model.define('   ', { schema: {} }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_COLLECTION_NAME',
        );
    });

    it('throws INVALID_COLLECTION_NAME for name with $', () => {
        assert.throws(
            () => MonSQLize.Model.define('my$col', { schema: {} }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_COLLECTION_NAME',
        );
    });

    it('throws INVALID_COLLECTION_NAME for name with dot', () => {
        assert.throws(
            () => MonSQLize.Model.define('my.col', { schema: {} }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_COLLECTION_NAME',
        );
    });

    it('accepts valid collection name', () => {
        assert.doesNotThrow(() => {
            MonSQLize.Model.define('valid_col', { schema: {} });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateDefinition branches
// ─────────────────────────────────────────────────────────────────────────────

describe('validateDefinition — branches', () => {

    it('throws INVALID_MODEL_DEFINITION for null definition', () => {
        assert.throws(
            () => MonSQLize.Model.define('c1', null),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });

    it('throws INVALID_MODEL_DEFINITION for non-object definition', () => {
        assert.throws(
            () => MonSQLize.Model.define('c2', 'not-an-object' as unknown),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });

    it('throws MISSING_SCHEMA when schema property is missing', () => {
        assert.throws(
            () => MonSQLize.Model.define('c3', {} as unknown),
            (e: unknown) => (e as { code?: string }).code === 'MISSING_SCHEMA',
        );
    });

    it('throws MISSING_SCHEMA when schema is null', () => {
        assert.throws(
            () => MonSQLize.Model.define('c4', { schema: null }),
            (e: unknown) => (e as { code?: string }).code === 'MISSING_SCHEMA',
        );
    });

    it('throws INVALID_SCHEMA_TYPE when schema is a number', () => {
        assert.throws(
            () => MonSQLize.Model.define('c5', { schema: 42 }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_SCHEMA_TYPE',
        );
    });

    it('throws INVALID_MODEL_DEFINITION for empty-string connection.pool', () => {
        assert.throws(
            () => MonSQLize.Model.define('c6', { schema: {}, connection: { pool: '   ' } }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });

    it('throws INVALID_MODEL_DEFINITION for non-string connection.pool', () => {
        assert.throws(
            () => MonSQLize.Model.define('c7', { schema: {}, connection: { pool: 123 as unknown as string } }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });

    it('throws INVALID_MODEL_DEFINITION for empty-string connection.database', () => {
        assert.throws(
            () => MonSQLize.Model.define('c8', { schema: {}, connection: { database: '  ' } }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });

    it('throws INVALID_MODEL_DEFINITION for non-string connection.database', () => {
        assert.throws(
            () => MonSQLize.Model.define('c9', { schema: {}, connection: { database: 0 as unknown as string } }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });

    it('accepts schema as object', () => {
        assert.doesNotThrow(() => {
            MonSQLize.Model.define('c10', { schema: {} });
        });
    });

    it('accepts schema as function', () => {
        assert.doesNotThrow(() => {
            MonSQLize.Model.define('c11', { schema: () => ({}) });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateRelationConfig branches
// ─────────────────────────────────────────────────────────────────────────────

describe('validateRelationConfig — branches via Model.define relations', () => {

    it('throws INVALID_ARGUMENT when relation.from is missing', () => {
        assert.throws(
            () => MonSQLize.Model.define('r1', {
                schema: {},
                relations: { users: { localField: 'userId', foreignField: '_id' } },
            }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_ARGUMENT',
        );
    });

    it('throws INVALID_ARGUMENT when relation.localField is missing', () => {
        assert.throws(
            () => MonSQLize.Model.define('r2', {
                schema: {},
                relations: { users: { from: 'users', foreignField: '_id' } },
            }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_ARGUMENT',
        );
    });

    it('throws INVALID_ARGUMENT when relation.foreignField is missing', () => {
        assert.throws(
            () => MonSQLize.Model.define('r3', {
                schema: {},
                relations: { users: { from: 'users', localField: 'userId' } },
            }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_ARGUMENT',
        );
    });

    it('throws INVALID_ARGUMENT when relation.from is empty string', () => {
        assert.throws(
            () => MonSQLize.Model.define('r4', {
                schema: {},
                relations: { users: { from: '  ', localField: 'userId', foreignField: '_id' } },
            }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_ARGUMENT',
        );
    });

    it('throws INVALID_ARGUMENT when relation.single is not boolean', () => {
        assert.throws(
            () => MonSQLize.Model.define('r5', {
                schema: {},
                relations: {
                    users: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        single: 'yes' as unknown as boolean,
                    },
                },
            }),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_ARGUMENT',
        );
    });

    it('accepts valid relation config', () => {
        assert.doesNotThrow(() => {
            MonSQLize.Model.define('r6', {
                schema: {},
                relations: {
                    users: { from: 'users', localField: 'userId', foreignField: '_id', single: true },
                },
            });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// processTimestamps branches
// ─────────────────────────────────────────────────────────────────────────────

describe('processTimestamps — branches', () => {

    it('timestamps: true adds createdAt and updatedAt with default names', () => {
        MonSQLize.Model.define('ts1', {
            schema: {},
            options: { timestamps: true },
        } as unknown);
        const reg = MonSQLize.Model.get('ts1');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        assert.deepEqual(hooks?.timestamps, { createdAt: 'createdAt', updatedAt: 'updatedAt' });
    });

    it('timestamps: false sets timestamps to undefined', () => {
        MonSQLize.Model.define('ts2', {
            schema: {},
            options: { timestamps: false },
        } as unknown);
        const reg = MonSQLize.Model.get('ts2');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        assert.equal(hooks?.timestamps, undefined);
    });

    it('timestamps: null is treated as no timestamps', () => {
        assert.doesNotThrow(() => {
            MonSQLize.Model.define('ts3', {
                schema: {},
                options: { timestamps: null },
            } as unknown);
        });
        const reg = MonSQLize.Model.get('ts3');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks;
        assert.ok(!hooks || !(hooks as Record<string, unknown>).timestamps);
    });

    it('timestamps: { createdAt: true } adds createdAt and defaults updatedAt', () => {
        MonSQLize.Model.define('ts4', {
            schema: {},
            options: { timestamps: { createdAt: true } },
        } as unknown);
        const reg = MonSQLize.Model.get('ts4');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        assert.deepEqual(hooks?.timestamps, { createdAt: 'createdAt', updatedAt: 'updatedAt' });
    });

    it('timestamps: { createdAt: "created" } sets custom name and defaults updatedAt', () => {
        MonSQLize.Model.define('ts5', {
            schema: {},
            options: { timestamps: { createdAt: 'created' } },
        } as unknown);
        const reg = MonSQLize.Model.get('ts5');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        assert.deepEqual(hooks?.timestamps, { createdAt: 'created', updatedAt: 'updatedAt' });
    });

    it('timestamps: { createdAt: false } omits createdAt', () => {
        MonSQLize.Model.define('ts6', {
            schema: {},
            options: { timestamps: { createdAt: false, updatedAt: true } },
        } as unknown);
        const reg = MonSQLize.Model.get('ts6');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        const ts = hooks?.timestamps as Record<string, unknown> | undefined;
        assert.ok(!ts || !('createdAt' in ts));
    });

    it('timestamps: { updatedAt: "modified" } sets custom updatedAt only', () => {
        MonSQLize.Model.define('ts7', {
            schema: {},
            options: { timestamps: { updatedAt: 'modified' } },
        } as unknown);
        const reg = MonSQLize.Model.get('ts7');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        const ts = hooks?.timestamps as Record<string, unknown> | undefined;
        assert.equal(ts?.updatedAt, 'modified');
        assert.ok(!ts || !('createdAt' in ts));
    });

    it('timestamps: { updatedAt: false } sets timestamps to undefined (empty result)', () => {
        MonSQLize.Model.define('ts8', {
            schema: {},
            options: { timestamps: { updatedAt: false } },
        } as unknown);
        const reg = MonSQLize.Model.get('ts8');
        const hooks = (reg?.definition as Record<string, unknown>)._internalHooks as Record<string, unknown>;
        assert.equal(hooks?.timestamps, undefined);
    });

    it('timestamps: invalid type throws INVALID_MODEL_DEFINITION', () => {
        assert.throws(
            () => MonSQLize.Model.define('ts9', {
                schema: {},
                options: { timestamps: 'invalid' as unknown },
            } as unknown),
            (e: unknown) => (e as { code?: string }).code === 'INVALID_MODEL_DEFINITION',
        );
    });
});
