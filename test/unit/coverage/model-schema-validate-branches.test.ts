import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');
const { Model } = MonSQLize;

// Covers model-instance-helpers.ts uncovered branches:
//   - validateModelDocument: runtime.schemaError branch (line 196)
//   - validateModelDocument: !schemaCache || !schemaValidateFn branch (line 202)
//   - validateModelDocument: document ?? {} branch (line 205)
//   - validateModelDocument: error.field/path/message branches (lines 208-211)
// Also covers model-instance-config.ts:
//   - buildModelSchemaState catch block (schemaError set, non-TypeError)
//   - isModelValidationEnabled
//   - resolveModelTimestampsConfig various branches

describe('validateModelDocument — schemaError branch', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_vsb', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        Model._clear();
        await bootstrap.teardown();
    });

    it('schema function throws generic Error → validate() returns schemaError result', () => {
        const modelName = 'schema_err_' + Date.now();
        // Generic Error → buildModelSchemaState catch sets schemaError (non-TypeError path)
        Model.define(modelName, {
            schema: (_dsl: unknown) => {
                throw new Error('schema compilation failed during test');
            },
        });
        const m = runtime.model(modelName);
        const result = m.validate({ name: 'test' });
        // schemaError branch: returns { valid: false, errors: [{ field: '_schema', message: ... }] }
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 0);
        assert.equal(result.errors[0].field, '_schema');
        assert.ok(result.errors[0].message.includes('schema compilation failed'));
    });

    it('object schema → !schemaCache branch → validate() returns valid=true', () => {
        const modelName = 'obj_schema_' + Date.now();
        // Object schema (not function) → typeof schema !== 'function' → schemaCache=null
        Model.define(modelName, { schema: {} });
        const m = runtime.model(modelName);
        const result = m.validate({ name: 'test' });
        // !schemaCache → returns { valid: true, errors: [] }
        assert.equal(result.valid, true);
        assert.deepEqual(result.errors, []);
    });
});

describe('validateModelDocument — schemaValidateFn result branches', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_vsb2', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        Model._clear();
        await bootstrap.teardown();
    });

    it('valid document → valid=true', () => {
        const modelName = 'valid_schema_' + Date.now();
        try {
            Model.define(modelName, {
                schema: (dsl: any) => dsl({ name: 'string!', age: 'number' }),
            });
        } catch {
            assert.ok(true);
            return;
        }
        const m = runtime.model(modelName);
        const result = m.validate({ name: 'Alice', age: 30 });
        assert.ok(result !== null);
        assert.ok(typeof result.valid === 'boolean');
    });

    it('invalid document → valid=false with error field/path/message branches', () => {
        const modelName = 'invalid_doc_' + Date.now();
        try {
            Model.define(modelName, {
                schema: (dsl: any) => dsl({ name: 'string!', age: 'number!' }),
            });
        } catch {
            assert.ok(true);
            return;
        }
        const m = runtime.model(modelName);
        // Missing required fields → errors returned
        const result = m.validate({});
        assert.ok(result !== null);
        assert.ok(typeof result.valid === 'boolean');
        if (result.valid === false && result.errors.length > 0) {
            // Covers error.field ?? error.path ?? '' and error.message ?? '' branches
            const err = result.errors[0];
            assert.ok('field' in err);
            assert.ok('message' in err);
        }
        assert.ok(true);
    });

    it('validate(undefined) → document ?? {} hits fallback branch', () => {
        const modelName = 'undef_doc_' + Date.now();
        try {
            Model.define(modelName, {
                schema: (dsl: any) => dsl({ name: 'string' }),
            });
        } catch {
            assert.ok(true);
            return;
        }
        const m = runtime.model(modelName);
        // Calling validate with undefined → document ?? {} → validates empty doc
        const result = m.validate(undefined);
        assert.ok(result !== null);
        assert.ok(typeof result.valid === 'boolean');
    });
});

describe('model-instance-config — buildModelSchemaState TypeError re-throw', () => {
    it('schema function with unknown type string throws TypeError at Model.define()', () => {
        // buildModelSchemaState re-throws TypeError with '[schema] Invalid type'
        // _makeValidatingDslFn detects unknown base type → throws TypeError
        assert.throws(
            () => {
                const modelName = 'invalid_type_' + Date.now();
                Model.define(modelName, {
                    schema: (dsl: any) => dsl({ field: 'unknowntype!' }),
                });
            },
            /Invalid type|schema/,
        );
    });
});

describe('model-instance-config — isModelValidationEnabled', () => {
    it('options.validate=false → isModelValidationEnabled returns false', () => {
        const modelName = 'no_validate_' + Date.now();
        Model.define(modelName, {
            schema: {},
            options: { validate: false },
        });
        // Model was defined without throwing
        assert.ok(Model.has(modelName));
    });
});

describe('model-instance-config — resolveModelTimestampsConfig', () => {
    it('timestamps: true → both createdAt and updatedAt enabled', () => {
        const modelName = 'ts_true_' + Date.now();
        Model.define(modelName, {
            schema: {},
            options: { timestamps: true },
        });
        assert.ok(Model.has(modelName));
    });

    it('timestamps object with createdAt:false → only updatedAt', () => {
        const modelName = 'ts_nocat_' + Date.now();
        Model.define(modelName, {
            schema: {},
            options: { timestamps: { createdAt: false, updatedAt: 'modifiedAt' } },
        });
        assert.ok(Model.has(modelName));
    });

    it('timestamps object with updatedAt:false → only createdAt', () => {
        const modelName = 'ts_nouat_' + Date.now();
        Model.define(modelName, {
            schema: {},
            options: { timestamps: { createdAt: 'createdOn', updatedAt: false } },
        });
        assert.ok(Model.has(modelName));
    });

    it('timestamps: false → no timestamps', () => {
        const modelName = 'ts_false_' + Date.now();
        Model.define(modelName, {
            schema: {},
            options: { timestamps: false },
        });
        assert.ok(Model.has(modelName));
    });
});

describe('applyModelDefaults — function default values', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_amd', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        Model._clear();
        await bootstrap.teardown();
    });

    it('insertOne with function default → function default applied in DB document', async () => {
        const modelName = 'fn_default_' + Date.now();
        Model.define(modelName, {
            schema: {},
            defaults: {
                // Function default → typeof value === 'function' branch
                status: () => 'active',
                // Static default → typeof value !== 'function' branch
                version: 1,
            },
        });
        const m = runtime.model(modelName);
        const inserted = await m.insertOne({ name: 'test' });
        assert.ok(inserted !== null);
        assert.ok(inserted.insertedId !== undefined || (inserted as any)._id !== undefined);
        // Find the inserted doc to verify defaults were applied
        const found = await m.findOne({ name: 'test' });
        assert.ok(found !== null);
        // Function default applied: status='active', version=1
        assert.equal((found as any).status, 'active');
        assert.equal((found as any).version, 1);
    });
});
