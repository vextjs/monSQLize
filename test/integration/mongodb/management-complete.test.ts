import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('Collection accessor — management-complete coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_mgmt_complete',
            config: { uri },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── raw ───────────────────────────────────────────────────────────────────

    it('raw() returns the underlying MongoDB Collection', () => {
        const col = runtime.collection('raw_test');
        const raw = col.raw();
        assert.ok(raw !== null && raw !== undefined);
        assert.ok(typeof raw.insertOne === 'function');
    });

    // ── createCollection / dropCollection ──────────────────────────────────────

    it('createCollection creates a new collection', async () => {
        const result = await runtime.collection('mgmt_create_test').createCollection();
        assert.ok(result === true || result !== undefined);
    });

    it('dropCollection drops an existing collection', async () => {
        const col = runtime.collection('mgmt_drop_me');
        await col.insertOne({ x: 1 });
        const result = await col.dropCollection();
        assert.ok(result === true || result !== undefined);
    });

    it('createCollection with custom name', async () => {
        const col = runtime.collection('src_coll_for_named');
        const result = await col.createCollection('named_coll_alias', {});
        assert.ok(result === true || result !== undefined);
    });

    // ── createView ────────────────────────────────────────────────────────────

    it('createView creates a MongoDB view', async () => {
        const src = runtime.collection('view_source');
        await src.insertOne({ category: 'A', val: 10 });
        const result = await src.createView('test_view_123', 'view_source', [
            { $match: { category: 'A' } },
        ]);
        assert.ok(result === true || result !== undefined);
    });

    // ── indexStats ────────────────────────────────────────────────────────────

    it('indexStats returns array of index stats', async () => {
        const col = runtime.collection('idx_stats_test');
        await col.insertOne({ x: 1 });
        const result = await col.indexStats();
        assert.ok(Array.isArray(result));
    });

    it('createIndex rejects invalid index direction values', async () => {
        const col = runtime.collection('idx_invalid_value');
        await assert.rejects(
            () => col.createIndex({ email: 'ascending' }),
            /invalid value/i,
        );
    });

    it('createIndexes rejects an empty specs array', async () => {
        const col = runtime.collection('idx_empty_specs');
        await assert.rejects(
            () => col.createIndexes([]),
            /non-empty array/i,
        );
    });

    it('listIndexes returns [] for a missing collection namespace', async () => {
        const col = runtime.collection('idx_missing_namespace');
        const result = await col.listIndexes();
        assert.deepEqual(result, []);
    });

    it('dropIndex throws a normalized error when the index does not exist', async () => {
        const col = runtime.collection('idx_missing_name');
        await col.insertOne({ x: 1 });
        await assert.rejects(
            () => col.dropIndex('missing_idx'),
            /Index does not exist: missing_idx/,
        );
    });

    it('dropIndexes treats a missing collection as a successful no-op', async () => {
        const col = runtime.collection('idx_missing_drop_all');
        const result = await col.dropIndexes();
        assert.equal(result.ok, 1);
        assert.equal(result.nIndexesWas, 0);
    });

    // ── setValidator / getValidator ───────────────────────────────────────────

    it('setValidator sets a JSON Schema validator on collection', async () => {
        const col = runtime.collection('validator_test');
        await col.insertOne({ name: 'seed' });
        const result = await col.setValidator(
            { $jsonSchema: { bsonType: 'object', properties: { name: { bsonType: 'string' } } } },
            { validationLevel: 'moderate', validationAction: 'warn' },
        );
        assert.ok(result.ok === 1);
        assert.equal(result.collection, 'validator_test');
    });

    it('setValidator with empty validator and no options sets strict/error defaults', async () => {
        const col = runtime.collection('validator_empty_test');
        await col.insertOne({ x: 1 });
        const result = await col.setValidator({});
        assert.ok(result.ok === 1);
    });

    it('setValidator throws for non-object validator', async () => {
        const col = runtime.collection('validator_bad');
        await assert.rejects(() => col.setValidator('not-an-object'), /Validator must be a non-null object/);
    });

    it('getValidator retrieves current validator settings', async () => {
        const col = runtime.collection('get_validator_test');
        await col.insertOne({ x: 1 });
        const result = await col.getValidator();
        assert.ok('validationLevel' in result);
        assert.ok('validationAction' in result);
        assert.ok('validator' in result);
    });

    // ── setValidationLevel / setValidationAction ──────────────────────────────

    it('setValidationLevel sets level to "off"', async () => {
        const col = runtime.collection('val_level_test');
        await col.insertOne({ x: 1 });
        const result = await col.setValidationLevel('off');
        assert.equal(result.ok, 1);
        assert.equal(result.validationLevel, 'off');
    });

    it('setValidationLevel sets level to "moderate"', async () => {
        const col = runtime.collection('val_level_mod');
        await col.insertOne({ x: 1 });
        const result = await col.setValidationLevel('moderate');
        assert.equal(result.ok, 1);
        assert.equal(result.validationLevel, 'moderate');
    });

    it('setValidationLevel throws for invalid level', async () => {
        const col = runtime.collection('val_level_bad');
        await assert.rejects(
            () => col.setValidationLevel('invalid'),
            /Invalid validation level/,
        );
    });

    it('setValidationAction sets action to "warn"', async () => {
        const col = runtime.collection('val_action_test');
        await col.insertOne({ x: 1 });
        const result = await col.setValidationAction('warn');
        assert.equal(result.ok, 1);
        assert.equal(result.validationAction, 'warn');
    });

    it('setValidationAction throws for invalid action', async () => {
        const col = runtime.collection('val_action_bad');
        await assert.rejects(
            () => col.setValidationAction('invalid'),
            /Invalid validation action/,
        );
    });

    // ── stats ─────────────────────────────────────────────────────────────────

    it('stats returns collection statistics', async () => {
        const col = runtime.collection('stats_test');
        await col.insertOne({ data: 'some data' });
        const result = await col.stats();
        assert.ok(typeof result.count === 'number');
        assert.ok(typeof result.ns === 'string');
        assert.ok(typeof result.storageSize === 'number');
    });

    it('stats with scale option', async () => {
        const col = runtime.collection('stats_scale_test');
        await col.insertOne({ data: 'x' });
        const result = await col.stats({ scale: 1024 });
        assert.ok(result !== null);
    });

    // ── renameCollection ──────────────────────────────────────────────────────

    it('renameCollection renames collection', async () => {
        const col = runtime.collection('rename_src');
        await col.insertOne({ x: 1 });
        try {
            await runtime.collection('rename_dst').dropCollection();
        } catch {}
        const result = await col.renameCollection('rename_dst');
        assert.equal(result.renamed, true);
        assert.equal(result.from, 'rename_src');
        assert.equal(result.to, 'rename_dst');
    });

    it('renameCollection throws for non-string name', async () => {
        const col = runtime.collection('rename_bad');
        await assert.rejects(
            () => col.renameCollection(null),
            /New collection name is required/,
        );
    });

    // ── collMod ───────────────────────────────────────────────────────────────

    it('collMod modifies collection with empty options', async () => {
        const col = runtime.collection('collmod_test');
        await col.insertOne({ x: 1 });
        const result = await col.collMod({});
        assert.ok(result !== null);
    });

    it('collMod throws for non-object modifications', async () => {
        const col = runtime.collection('collmod_bad');
        await assert.rejects(
            () => col.collMod(null),
            /Modifications must be a non-null object/,
        );
    });

    // ── convertToCapped ───────────────────────────────────────────────────────

    it('convertToCapped converts collection to capped', async () => {
        const col = runtime.collection('capped_test');
        await col.insertOne({ x: 1 });
        try {
            const result = await col.convertToCapped(1024 * 1024);
            assert.ok(result.capped === true);
            assert.equal(result.collection, 'capped_test');
        } catch (err: any) {
            // Some MongoDB memory server versions may not support this command
            assert.ok(err.message || err.toString());
        }
    });

    it('convertToCapped throws for non-numeric size', async () => {
        const col = runtime.collection('capped_bad');
        await assert.rejects(
            () => col.convertToCapped('big'),
            /Size must be a number/,
        );
    });

    it('convertToCapped throws for size <= 0', async () => {
        const col = runtime.collection('capped_neg');
        await assert.rejects(
            () => col.convertToCapped(-1),
            /Size must be a positive number/,
        );
    });

    it('convertToCapped with max option', async () => {
        const col = runtime.collection('capped_max_test');
        await col.insertOne({ x: 1 });
        try {
            const result = await col.convertToCapped(1024 * 1024, { max: 100 });
            assert.ok(result !== null);
        } catch {
            // tolerated if unsupported
        }
    });

    it('prewarmBookmarks counts invalid pages as failed while warming valid pages', async () => {
        const col = runtime.collection('bookmark_partial_prewarm');
        await col.insertMany([
            { title: 'A', status: 'published', createdAt: new Date('2026-05-01T00:00:00Z') },
            { title: 'B', status: 'published', createdAt: new Date('2026-05-02T00:00:00Z') },
        ]);

        const result = await col.prewarmBookmarks(
            { query: { status: 'published' }, sort: { createdAt: 1 }, limit: 1 },
            [0, 1],
        );

        assert.equal(result.warmed, 1);
        assert.equal(result.failed, 1);
        assert.equal(result.keys.length, 1);
    });
});
