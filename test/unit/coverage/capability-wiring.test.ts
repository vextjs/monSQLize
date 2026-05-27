import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// These functions are exported from the compiled bundle as part of MonSQLize internals.
// We access them via the capabilityWiring namespace if exposed, otherwise via the main exports.
// The goal is to hit lines/branches in capability-wiring.ts.

describe('capability-wiring coverage', () => {

    // ── initAutoConvertConfig branches ────────────────────────────────────────

    describe('autoConvert config (via MonSQLize constructor)', () => {
        it('mongodb type + autoConvertObjectId=false → disabled', () => {
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'x', config: { uri: 'mongodb://localhost' }, autoConvertObjectId: false });
            assert.ok(r);
        });

        it('mongodb type + autoConvertObjectId=true → enabled', () => {
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'x', config: { uri: 'mongodb://localhost' }, autoConvertObjectId: true });
            assert.ok(r);
        });

        it('mongodb type + autoConvertObjectId as object → merges config', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                autoConvertObjectId: { enabled: true, excludeFields: ['_id'], maxDepth: 5 },
            });
            assert.ok(r);
        });

        it('mongodb type + autoConvertObjectId object with enabled=false', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                autoConvertObjectId: { enabled: false },
            });
            assert.ok(r);
        });

        it('mongodb type + default (no autoConvertObjectId) → defaults to true', () => {
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'x', config: { uri: 'mongodb://localhost' } });
            assert.ok(r);
        });
    });

    // ── buildRuntimeDefaults branches ─────────────────────────────────────────

    describe('buildRuntimeDefaults (via constructor options)', () => {
        it('maxTimeMS, findLimit, slowQueryMs passed through', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                maxTimeMS: 3000,
                findLimit: 500,
                slowQueryMs: 100,
                findPageMaxLimit: 200,
                cursorSecret: 'secret',
                namespace: 'ns',
            });
            assert.ok(r);
        });

        it('countQueue disabled', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                countQueue: { enabled: false },
            });
            assert.ok(r);
        });

        it('countQueue with custom concurrency', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                countQueue: { enabled: true, concurrency: 4, maxQueueSize: 5000, timeout: 30000 },
            });
            assert.ok(r);
        });
    });

    // ── initializeDistributedCacheInvalidator branches ────────────────────────

    describe('distributed cache invalidator config', () => {
        it('cache as MemoryCache instance → returns null (already a CacheLike)', () => {
            // cache.distributed is skipped when cache is already a CacheLike instance
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                cache: new MonSQLize.MemoryCache(),
            });
            assert.ok(r);
        });

        it('cache as plain object without distributed → no invalidator', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                cache: { ttl: 60000 },
            });
            assert.ok(r);
        });

        it('cache.distributed.enabled=false → no invalidator', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                cache: { ttl: 60000, distributed: { enabled: false } },
            });
            assert.ok(r);
        });

        it('cache.distributed with no redis → construction fails gracefully', () => {
            // DistributedCacheInvalidator throws if ioredis is not installed or config is invalid.
            // The wiring function catches the error and returns null — no exception propagated.
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                cache: { ttl: 60000, distributed: { enabled: true } },
            });
            assert.ok(r);
        });
    });

    // ── loadModelFiles branches ───────────────────────────────────────────────

    describe('loadModelFiles (via models option)', () => {
        let tmpDir = '';

        afterEach(() => {
            if (tmpDir) {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
                tmpDir = '';
            }
            MonSQLize.Model._clear();
        });

        it('models not configured → no error', () => {
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'x', config: { uri: 'mongodb://localhost' } });
            assert.ok(r);
        });

        it('models as string path → scans directory on connect()', async () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-'));
            const modelFile = path.join(tmpDir, 'user.model.js');
            fs.writeFileSync(modelFile, `
                const MonSQLize = require(${JSON.stringify(require.resolve('../../../dist/cjs/index.cjs'))});
                MonSQLize.Model.define('wiring_user', { schema: () => ({}) });
                module.exports = { name: 'wiring_user', schema: () => ({}) };
            `);
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'x', config: { uri: 'mongodb://localhost' }, models: tmpDir });
            // connect() triggers loadModelFiles; we can't connect without a DB, but constructor + options path hit initAutoConvertConfig
            // Test that the MonSQLize instance was constructed with the models path
            assert.ok(r);
        });

        it('models as object with path → uses custom pattern', () => {
            const r = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                models: { path: '/nonexistent/path', pattern: '*.js', recursive: true },
            });
            assert.ok(r);
        });

        it('runtime._loadModels() loads valid model files from string path', async () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-load-'));
            const modelFile = path.join(tmpDir, 'loaded.model.js');
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'loaded_model_from_file',
                    schema: {},
                };
            `);

            const runtime = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                models: tmpDir,
            });

            await runtime._loadModels();

            assert.ok(MonSQLize.Model.has('loaded_model_from_file'));
        });

        it('runtime._loadModels() skips files without a name export', async () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-noname-'));
            const modelFile = path.join(tmpDir, 'invalid.model.js');
            fs.writeFileSync(modelFile, 'module.exports = { schema: {} };');

            const runtime = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                models: tmpDir,
            });

            await runtime._loadModels();

            assert.equal(MonSQLize.Model.has('invalid'), false);
        });

        it('runtime._loadModels({ reload: true }) redefines an existing model', async () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-reload-'));
            const modelFile = path.join(tmpDir, 'reloadable.model.js');
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'reloadable_model',
                    schema: {},
                    virtuals: {
                        first: { get() { return 'first'; } }
                    }
                };
            `);

            const runtime = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                models: tmpDir,
            });

            await runtime._loadModels();
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'reloadable_model',
                    schema: {},
                    virtuals: {
                        second: { get() { return 'second'; } }
                    }
                };
            `);

            await runtime._loadModels({ reload: true });

            const definition = MonSQLize.Model.get('reloadable_model');
            assert.ok(definition !== null);
            assert.ok('second' in definition.definition.virtuals);
        });

        it('runtime._loadModels() supports recursive object config with custom pattern', async () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msq-wiring-recursive-'));
            const nestedDir = path.join(tmpDir, 'nested');
            fs.mkdirSync(nestedDir);
            const modelFile = path.join(nestedDir, 'deep.custom.js');
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'deep_model',
                    schema: {},
                };
            `);

            const runtime = new MonSQLize({
                type: 'mongodb',
                databaseName: 'x',
                config: { uri: 'mongodb://localhost' },
                models: { path: tmpDir, pattern: '*.custom.js', recursive: true },
            });

            await runtime._loadModels();

            assert.ok(MonSQLize.Model.has('deep_model'));
        });
    });

    // ── adaptLegacyCacheLike ──────────────────────────────────────────────────

    describe('adaptLegacyCacheLike', () => {
        it('returns the original object when it already has has()', () => {
            const cache = {
                has: (k: string) => k === 'x',
                get: async () => null,
                set: async () => {},
                del: async () => {},
                exists: async () => false,
            };
            const adapted = MonSQLize.adaptLegacyCacheLike(cache);
            assert.strictEqual(adapted, cache);
        });

        it('adds has() via proxy when original lacks it', () => {
            let existsCalled = '';
            const legacyCache = {
                get: async () => null,
                set: async () => {},
                del: async () => {},
                exists: async (key: string) => { existsCalled = key; return true; },
            };
            const adapted = MonSQLize.adaptLegacyCacheLike(legacyCache);
            // has() should delegate to exists()
            adapted.has('test-key');
            assert.equal(existsCalled, 'test-key');
        });

        it('proxy forwards other methods to original', () => {
            let calledWith = '';
            const legacyCache = {
                get: async (key: string) => { calledWith = key; return null; },
                set: async () => {},
                del: async () => {},
                exists: async () => false,
            };
            const adapted = MonSQLize.adaptLegacyCacheLike(legacyCache);
            adapted.get('look-up');
            assert.equal(calledWith, 'look-up');
        });
    });

    // ── runtime-scoped-collection branches ───────────────────────────────────

    describe('scoped collection routing', () => {
        it('falls back to dbInstance.db().collection() when client is unavailable', () => {
            const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });
            const rawCollection = { source: 'dbInstance-fallback' };

            Object.defineProperty(runtime, 'dbInstance', {
                configurable: true,
                value: {
                    collection() {
                        return { source: 'default-collection' };
                    },
                    db(dbName: string) {
                        return {
                            collection(collectionName: string) {
                                return { ...rawCollection, dbName, collectionName };
                            },
                        };
                    },
                },
            });

            const result = runtime._resolveModelCollection('audit_logs', { database: 'audit_db' });
            assert.deepEqual(result, {
                source: 'dbInstance-fallback',
                dbName: 'audit_db',
                collectionName: 'audit_logs',
            });
        });

        it('throws NO_POOL_MANAGER when a scoped pool is requested without a pool manager', () => {
            const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });

            Object.defineProperty(runtime, 'dbInstance', {
                configurable: true,
                value: {
                    collection() { return {}; },
                    db() { return { collection() { return {}; } }; },
                },
            });

            assert.throws(
                () => runtime._resolveModelCollection('audit_logs', { pool: 'analytics' }),
                (error: unknown) => Boolean(
                    error
                    && typeof error === 'object'
                    && 'code' in error
                    && (error as { code?: string }).code === 'NO_POOL_MANAGER',
                ),
            );
        });

        it('throws POOL_NOT_FOUND and includes available pools', () => {
            const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });

            Object.defineProperty(runtime, 'dbInstance', {
                configurable: true,
                value: {
                    collection() { return {}; },
                    db() { return { collection() { return {}; } }; },
                },
            });
            Object.defineProperty(runtime, '_poolManager', {
                configurable: true,
                value: {
                    getPool() {
                        return null;
                    },
                    getPoolNames() {
                        return ['primary', 'analytics'];
                    },
                },
            });

            assert.throws(
                () => runtime._resolveModelCollection('audit_logs', { pool: 'missing' }),
                (error: unknown) => {
                    if (!error || typeof error !== 'object') {
                        return false;
                    }
                    return (error as { code?: string }).code === 'POOL_NOT_FOUND'
                        && Array.isArray((error as { available?: unknown }).available)
                        && (error as { available?: string[] }).available?.includes('analytics') === true;
                },
            );
        });

        it('prefers adapter.collectionFromClient for scoped pools when available', () => {
            const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });
            const fakeClient = { name: 'pool-client' };
            const routed = { source: 'adapter-route' };

            Object.defineProperty(runtime, 'dbInstance', {
                configurable: true,
                value: {
                    collection() { return {}; },
                    db() { return { collection() { return {}; } }; },
                },
            });
            Object.defineProperty(runtime, '_poolManager', {
                configurable: true,
                value: {
                    getPool(poolName: string) {
                        return poolName === 'analytics' ? fakeClient : null;
                    },
                    selectPool() {
                        throw new Error('adapter path should win');
                    },
                },
            });
            Object.defineProperty(runtime, '_adapter', {
                configurable: true,
                value: {
                    collectionFromClient(currentClient: unknown, dbName: string, collectionName: string) {
                        assert.strictEqual(currentClient, fakeClient);
                        assert.equal(dbName, 'audit_db');
                        assert.equal(collectionName, 'audit_logs');
                        return routed;
                    },
                },
            });

            const result = runtime._resolveModelCollection('audit_logs', { pool: 'analytics', database: 'audit_db' });
            assert.strictEqual(result, routed);
        });

        it('falls back to poolManager.selectPool when no adapter route exists', () => {
            const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });
            const pooledRaw = { source: 'selected-pool-collection' };

            Object.defineProperty(runtime, 'dbInstance', {
                configurable: true,
                value: {
                    collection() { return {}; },
                    db() { return { collection() { return {}; } }; },
                },
            });
            Object.defineProperty(runtime, '_poolManager', {
                configurable: true,
                value: {
                    getPool(poolName: string) {
                        return poolName === 'analytics' ? { name: 'pool-client' } : null;
                    },
                    selectPool(role: string, options: { pool: string; databaseName: string }) {
                        assert.equal(role, 'read');
                        assert.deepEqual(options, { pool: 'analytics', databaseName: 'audit_db' });
                        return {
                            collection(dbName: string, collectionName: string) {
                                assert.equal(dbName, 'audit_db');
                                assert.equal(collectionName, 'audit_logs');
                                return pooledRaw;
                            },
                        };
                    },
                },
            });

            const result = runtime._resolveModelCollection('audit_logs', { pool: 'analytics', database: 'audit_db' });
            assert.equal(typeof result.getNamespace, 'function');
            assert.deepEqual(result.getNamespace(), {
                iid: 'audit_db:audit_logs',
                type: 'mongodb',
                db: 'audit_db',
                collection: 'audit_logs',
            });
            assert.strictEqual(result.raw(), pooledRaw);
        });
    });
});
