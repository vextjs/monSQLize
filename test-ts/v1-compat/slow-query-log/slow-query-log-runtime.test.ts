import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize, { type SlowQueryLogEntry } from 'monsqlize';

describe('Stage B slow-query-log TS migration', () => {
    it('应支持 BatchQueue 按批次冲刷并在 close 时收口剩余日志', async () => {
        const flushedBatches: SlowQueryLogEntry[][] = [];
        const queue = new MonSQLize.BatchQueue(
            {
                saveBatch: async (entries) => {
                    flushedBatches.push(entries);
                },
            },
            {
                size: 2,
                interval: 50,
                maxBufferSize: 4,
            },
        );

        await queue.add({
            database: 'app',
            collection: 'users',
            operation: 'find',
            durationMs: 600,
        });
        assert.equal(flushedBatches.length, 0);

        await queue.add({
            database: 'app',
            collection: 'users',
            operation: 'find',
            durationMs: 700,
        });
        assert.equal(flushedBatches.length, 1);
        assert.equal(flushedBatches[0].length, 2);

        await queue.add({
            database: 'app',
            collection: 'orders',
            operation: 'aggregate',
            durationMs: 1200,
        });
        await queue.close();

        assert.equal(flushedBatches.length, 2);
        assert.equal(flushedBatches[1].length, 1);
        assert.equal(flushedBatches[1][0].collection, 'orders');
    });

    it('应支持 SlowQueryLogConfigManager 合并默认值并按当前契约校验', () => {
        const merged = MonSQLize.SlowQueryLogConfigManager.mergeConfig({
            storage: { type: 'memory' },
            batch: {
                enabled: false,
                size: 2,
                interval: 5000,
                maxBufferSize: 100,
            },
            filter: {
                excludeDatabases: [],
                excludeCollections: [],
                excludeOperations: [],
                minExecutionTimeMs: 100,
            },
        });

        assert.equal(merged.enabled, true);
        assert.equal(merged.storage.type, 'memory');
        assert.equal(merged.batch.enabled, false);
        assert.equal(merged.batch.size, 2);
        assert.equal(merged.batch.interval, 5000);
        assert.equal(merged.filter.minExecutionTimeMs, 100);
        assert.equal(MonSQLize.SlowQueryLogConfigManager.validate(merged), true);
    });

    it('应支持 generateQueryHash 的 shape 归一化与稳定键序语义', () => {
        const canonical = MonSQLize.generateQueryHash({
            database: 'app',
            collection: 'users',
            operation: 'find',
            query: {
                status: 'active',
                age: { $gt: 18 },
            },
        });
        const aliased = MonSQLize.generateQueryHash({
            db: 'app',
            coll: 'users',
            op: 'find',
            queryShape: {
                age: { $gt: 18 },
                status: 'active',
            },
        });
        const differentOperation = MonSQLize.generateQueryHash({
            database: 'app',
            collection: 'users',
            operation: 'aggregate',
            query: {
                status: 'active',
                age: { $gt: 18 },
            },
        });

        assert.equal(canonical, aliased);
        assert.equal(canonical.length, 16);
        assert.notEqual(canonical, differentOperation);
    });
});