import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveModelTimestampsConfig,
    resolveModelSoftDeleteConfig,
    resolveModelVersionConfig,
    resolveModelHooksFactory,
    getModelEnums,
    attachModelStatics,
    isModelValidationEnabled,
    buildModelSchemaState,
} from '../../../src/capabilities/model/model-instance-config';

describe('resolveModelTimestampsConfig — branch coverage', () => {
    it('returns null when timestamps is undefined', () => {
        const result = resolveModelTimestampsConfig({ name: 'M', collection: 'c', options: {} });
        assert.equal(result, null);
    });

    it('returns null when timestamps is false', () => {
        const result = resolveModelTimestampsConfig({ name: 'M', collection: 'c', options: { timestamps: false } });
        assert.equal(result, null);
    });

    it('returns defaults when timestamps is true', () => {
        const result = resolveModelTimestampsConfig({ name: 'M', collection: 'c', options: { timestamps: true } });
        assert.deepEqual(result, { createdAt: 'createdAt', updatedAt: 'updatedAt' });
    });

    it('uses custom createdAt string', () => {
        const result = resolveModelTimestampsConfig({
            name: 'M', collection: 'c',
            options: { timestamps: { createdAt: 'created', updatedAt: 'updated' } },
        });
        assert.equal(result?.createdAt, 'created');
        assert.equal(result?.updatedAt, 'updated');
    });

    it('false createdAt → false, undefined updatedAt → default', () => {
        const result = resolveModelTimestampsConfig({
            name: 'M', collection: 'c',
            options: { timestamps: { createdAt: false } },
        });
        assert.equal(result?.createdAt, false);
        assert.equal(result?.updatedAt, 'updatedAt');
    });

    it('false updatedAt → false', () => {
        const result = resolveModelTimestampsConfig({
            name: 'M', collection: 'c',
            options: { timestamps: { updatedAt: false } },
        });
        assert.equal(result?.updatedAt, false);
        assert.equal(result?.createdAt, 'createdAt');
    });
});

describe('resolveModelSoftDeleteConfig — branch coverage', () => {
    it('returns null when no softDelete', () => {
        const result = resolveModelSoftDeleteConfig({ name: 'M', collection: 'c' });
        assert.equal(result, null);
    });

    it('returns defaults when softDelete is true', () => {
        const result = resolveModelSoftDeleteConfig({ name: 'M', collection: 'c', options: { softDelete: true } });
        assert.deepEqual(result, { enabled: true, field: 'deletedAt', type: 'timestamp', ttl: null });
    });

    it('uses custom config when softDelete is object', () => {
        const result = resolveModelSoftDeleteConfig({
            name: 'M', collection: 'c',
            options: { softDelete: { enabled: true, field: 'removed_at', type: 'boolean', ttl: 3600 } },
        });
        assert.equal(result?.field, 'removed_at');
        assert.equal(result?.type, 'boolean');
        assert.equal(result?.ttl, 3600);
    });

    it('enabled defaults to true when not specified in object', () => {
        const result = resolveModelSoftDeleteConfig({
            name: 'M', collection: 'c',
            options: { softDelete: {} },
        });
        assert.equal(result?.enabled, true);
    });

    it('enabled=false when explicitly disabled', () => {
        const result = resolveModelSoftDeleteConfig({
            name: 'M', collection: 'c',
            options: { softDelete: { enabled: false } },
        });
        assert.equal(result?.enabled, false);
    });
});

describe('resolveModelVersionConfig — branch coverage', () => {
    it('returns null when no version', () => {
        const result = resolveModelVersionConfig({ name: 'M', collection: 'c' });
        assert.equal(result, null);
    });

    it('returns defaults when version is true', () => {
        const result = resolveModelVersionConfig({ name: 'M', collection: 'c', options: { version: true } });
        assert.deepEqual(result, { enabled: true, field: 'version' });
    });

    it('uses custom field when version is object', () => {
        const result = resolveModelVersionConfig({
            name: 'M', collection: 'c',
            options: { version: { enabled: true, field: '__v' } },
        });
        assert.equal(result?.field, '__v');
    });

    it('enabled=false when version.enabled is false', () => {
        const result = resolveModelVersionConfig({
            name: 'M', collection: 'c',
            options: { version: { enabled: false } },
        });
        assert.equal(result?.enabled, false);
    });

    it('field defaults to version when version object has no field', () => {
        const result = resolveModelVersionConfig({
            name: 'M', collection: 'c',
            options: { version: {} },
        });
        assert.equal(result?.field, 'version');
    });
});

describe('resolveModelHooksFactory — branch coverage', () => {
    it('returns null when no hooks', () => {
        const result = resolveModelHooksFactory({ name: 'M', collection: 'c' });
        assert.equal(result, null);
    });

    it('returns function when hooks is a function', () => {
        const hooks = () => ({});
        const result = resolveModelHooksFactory({ name: 'M', collection: 'c', hooks } as any);
        assert.equal(result, hooks);
    });

    it('returns null when hooks is an object (not function)', () => {
        const result = resolveModelHooksFactory({ name: 'M', collection: 'c', hooks: {} } as any);
        assert.equal(result, null);
    });
});

describe('getModelEnums — branch coverage', () => {
    it('returns empty object when no enums defined', () => {
        const result = getModelEnums({ name: 'M', collection: 'c' });
        assert.deepEqual(result, {});
    });

    it('returns enums when defined', () => {
        const result = getModelEnums({ name: 'M', collection: 'c', enums: { status: ['active', 'inactive'] } } as any);
        assert.deepEqual(result, { status: ['active', 'inactive'] });
    });
});

describe('attachModelStatics — branch coverage', () => {
    it('skips when methods is a function (v1 compat)', () => {
        const target = {};
        attachModelStatics(target, { name: 'M', collection: 'c', methods: () => ({}) } as any);
        // no statics should be attached
        assert.equal(Object.keys(target).length, 0);
    });

    it('attaches statics to target', () => {
        const target: any = {};
        attachModelStatics(target, {
            name: 'M',
            collection: 'c',
            statics: { myStatic: () => 42 },
        } as any);
        assert.equal(typeof target.myStatic, 'function');
    });

    it('does not overwrite existing property on target', () => {
        const target: any = { existingProp: 'original' };
        attachModelStatics(target, {
            name: 'M', collection: 'c',
            statics: { existingProp: () => 'overwritten' },
        } as any);
        assert.equal(target.existingProp, 'original');
    });

    it('skips non-function statics', () => {
        const target: any = {};
        attachModelStatics(target, {
            name: 'M', collection: 'c',
            statics: { notAFunction: 'string-value' },
        } as any);
        // non-function static should not be attached
        assert.ok(!('notAFunction' in target));
    });
});

describe('isModelValidationEnabled — branch coverage', () => {
    it('returns true when validate not set', () => {
        assert.equal(isModelValidationEnabled({ name: 'M', collection: 'c' }), true);
    });

    it('returns false when validate=false', () => {
        assert.equal(isModelValidationEnabled({ name: 'M', collection: 'c', options: { validate: false } } as any), false);
    });

    it('returns true when validate=true', () => {
        assert.equal(isModelValidationEnabled({ name: 'M', collection: 'c', options: { validate: true } } as any), true);
    });
});

describe('buildModelSchemaState — branch coverage', () => {
    it('returns null schema state when no schema function', () => {
        const result = buildModelSchemaState({ name: 'M', collection: 'c' });
        assert.equal(result.schemaCache, null);
        assert.equal(result.schemaError, null);
    });

    it('returns null schema state when _schemaDslFn is null', () => {
        // schema function present but dslFn is null → no schema processing
        const result = buildModelSchemaState({ name: 'M', collection: 'c', schema: (dsl: unknown) => ({ type: 'object' }) } as any);
        // When _schemaDslFn is null (no jsonschema dependency), returns null cache
        assert.equal(result.schemaError, null);
    });
});
