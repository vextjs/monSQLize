import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers:
//   - write-utils.ts createIncrementUpdate error branches (NaN value, empty object, null field)
//   - collection-accessor.ts aggregate() autoConvertObjectId=false branch (line 289)
//   - collection-accessor.ts getNamespace() instanceId branch (line 167)

describe('write-utils — createIncrementUpdate error branches via incrementOne', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_incr_branches', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('incrementOne with NaN in object field → throws INVALID_ARGUMENT', async () => {
        const coll = runtime.collection('incr_nan_obj');
        await coll.insertOne({ x: 1 });
        await assert.rejects(
            () => coll.incrementOne({ x: 1 }, { count: NaN }),
            /increment value must be a number/,
        );
    });

    it('incrementOne with empty object field → throws INVALID_ARGUMENT', async () => {
        const coll = runtime.collection('incr_empty_obj');
        await coll.insertOne({ x: 2 });
        await assert.rejects(
            () => coll.incrementOne({ x: 2 }, {}),
            /field must be a string or object/,
        );
    });

    it('incrementOne with null field → throws INVALID_ARGUMENT', async () => {
        const coll = runtime.collection('incr_null');
        await coll.insertOne({ x: 3 });
        await assert.rejects(
            () => coll.incrementOne({ x: 3 }, null as any),
            /field must be a string or object/,
        );
    });

    it('incrementOne with array field → throws INVALID_ARGUMENT', async () => {
        const coll = runtime.collection('incr_array');
        await coll.insertOne({ x: 4 });
        await assert.rejects(
            () => coll.incrementOne({ x: 4 }, [1, 2] as any),
            /field must be a string or object/,
        );
    });

    it('incrementOne with blank string field → throws INVALID_ARGUMENT', async () => {
        const coll = runtime.collection('incr_blank');
        await coll.insertOne({ x: 5 });
        await assert.rejects(
            () => coll.incrementOne({ x: 5 }, '   '),
            /field must be a string or object/,
        );
    });

    it('incrementOne with string field + NaN increment → throws INVALID_ARGUMENT', async () => {
        const coll = runtime.collection('incr_nan_str');
        await coll.insertOne({ x: 6 });
        await assert.rejects(
            () => coll.incrementOne({ x: 6 }, 'count', NaN),
            /increment must be a number/,
        );
    });

    it('incrementOne with valid string field → success', async () => {
        const coll = runtime.collection('incr_valid');
        await coll.insertOne({ x: 7, count: 0 });
        const result = await coll.incrementOne({ x: 7 }, 'count', 1);
        assert.ok(result !== null);
    });

    it('incrementOne with valid object field → success', async () => {
        const coll = runtime.collection('incr_valid_obj');
        await coll.insertOne({ x: 8, count: 0, total: 0 });
        const result = await coll.incrementOne({ x: 8 }, { count: 1, total: 5 });
        assert.ok(result !== null);
    });
});

describe('collection-accessor — autoConvertObjectId=false aggregate branch', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        // autoConvertObjectId: false → collection-accessor.ts line 289 false branch
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_auto_cv_false',
            config: { uri },
            autoConvertObjectId: false,
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('aggregate with autoConvertObjectId=false → pipeline not converted', async () => {
        const coll = runtime.collection('agg_no_convert');
        await coll.insertMany([{ grp: 'a', val: 1 }, { grp: 'a', val: 2 }, { grp: 'b', val: 3 }]);
        const result = await coll.aggregate([{ $group: { _id: '$grp', total: { $sum: '$val' } } }]).toArray();
        assert.ok(Array.isArray(result));
        assert.ok(result.length >= 1);
    });

    it('aggregate empty pipeline with autoConvertObjectId=false', async () => {
        const coll = runtime.collection('agg_empty_pipe');
        await coll.insertOne({ z: 1 });
        const result = await coll.aggregate([]).toArray();
        assert.ok(Array.isArray(result));
    });
});

describe('collection-accessor — getNamespace with instanceId', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        // namespace.instanceId → collection-accessor.ts line 167 instanceId branch
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_ns_iid',
            config: { uri },
            namespace: { instanceId: 'test-instance-001' },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('getNamespace with instanceId → returns prefixed iid', () => {
        const coll = runtime.collection('ns_iid_test');
        const ns = coll.getNamespace();
        assert.ok(typeof ns.iid === 'string');
        // With instanceId: iid = "test-instance-001:test_ns_iid:ns_iid_test"
        assert.ok(ns.iid.includes('test-instance-001'));
        assert.equal(ns.type, 'mongodb');
        assert.equal(ns.db, 'test_ns_iid');
        assert.equal(ns.collection, 'ns_iid_test');
    });

    it('getNamespace without instanceId → returns db:collection format', async () => {
        // Use a runtime without instanceId to compare
        const bootstrapB = createMemoryServerBootstrap();
        const { uri: uriB } = await bootstrapB.setup();
        const runtimeB = new MonSQLize({ type: 'mongodb', databaseName: 'test_ns_plain', config: { uri: uriB } });
        await runtimeB.connect();
        try {
            const collB = runtimeB.collection('ns_plain_test');
            const ns = collB.getNamespace();
            assert.equal(ns.iid, 'test_ns_plain:ns_plain_test');
        } finally {
            await runtimeB.close();
            await bootstrapB.teardown();
        }
    });
});
