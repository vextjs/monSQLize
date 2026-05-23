import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import MonSQLize from 'monsqlize';

const { createReplSetBootstrap } = require(path.join(process.cwd(), 'test', 'bootstrap', 'replset-server'));

type UserDoc = {
    name: string;
    age: number;
    status: string;
};

type Watcher = {
    on(event: string, handler: (payload: unknown) => void): unknown;
    close(): Promise<void>;
};

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function schema(shape: Record<string, string>) {
    return (dsl: unknown) => (dsl as (input: Record<string, string>) => Record<string, unknown>)(shape);
}

describe('Stage B watch TS migration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_stage_b_watch' });
    let uri: string;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    afterEach(() => {
        MonSQLize.Model._clear();
    });

    it('collection.watch 应返回当前公开的原生 change stream 并接收过滤后的事件', async () => {
        const suffix = Date.now();
        const msq = new MonSQLize({
            type: 'mongodb',
            databaseName: `stage_b_watch_collection_${suffix}`,
            config: { uri },
        });
        let watcher: Watcher | null = null;

        try {
            await msq.connect();
            const users = msq.collection<UserDoc>(`stage_b_watch_users_${suffix}`);
            watcher = users.watch([
                { $match: { operationType: { $in: ['insert', 'update'] } } },
            ], {
                fullDocument: 'updateLookup',
            }) as unknown as Watcher;

            const eventsPromise = new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
                const events: Array<Record<string, unknown>> = [];
                const timer = setTimeout(() => reject(new Error('Timed out waiting for watch events.')), 10000);

                watcher?.on('change', (change) => {
                    events.push(change as Record<string, unknown>);
                    if (events.length >= 2) {
                        clearTimeout(timer);
                        resolve(events);
                    }
                });
                watcher?.on('error', (error) => {
                    clearTimeout(timer);
                    reject(error instanceof Error ? error : new Error(String(error)));
                });
            });

            await wait(500);

            const inserted = await users.insertOne({ name: 'alice', age: 25, status: 'active' });
            await users.updateOne({ _id: inserted.insertedId }, { $set: { age: 26 } });

            const events = await eventsPromise;

            assert.ok(watcher);
            assert.equal(typeof watcher.on, 'function');
            assert.equal(typeof watcher.close, 'function');
            assert.deepEqual(events.map((event) => event.operationType), ['insert', 'update']);
            assert.equal((events[0]?.fullDocument as UserDoc | undefined)?.name, 'alice');
            assert.equal((events[1]?.fullDocument as UserDoc | undefined)?.age, 26);
        } finally {
            if (watcher) {
                await watcher.close().catch(() => undefined);
            }
            await msq.close();
        }
    });

    it('model.watch 应沿用同一公开 watch 主链', async () => {
        const suffix = Date.now();
        const modelName = `stage_b_watch_model_${suffix}`;

        MonSQLize.Model.define(modelName, {
            schema: schema({ name: 'string', age: 'number', status: 'string' }),
        });

        const msq = new MonSQLize({
            type: 'mongodb',
            databaseName: `stage_b_watch_model_db_${suffix}`,
            config: { uri },
        });
        let watcher: Watcher | null = null;

        try {
            await msq.connect();
            const User = msq.model<UserDoc>(modelName);
            watcher = User.watch([{ $match: { operationType: 'insert' } }]) as unknown as Watcher;

            const eventPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Timed out waiting for model watch event.')), 10000);

                watcher?.on('change', (change) => {
                    clearTimeout(timer);
                    resolve(change as Record<string, unknown>);
                });
                watcher?.on('error', (error) => {
                    clearTimeout(timer);
                    reject(error instanceof Error ? error : new Error(String(error)));
                });
            });

            await wait(500);
            await User.insertOne({ name: 'bob', age: 30, status: 'active' });

            const event = await eventPromise;
            assert.equal(event.operationType, 'insert');
            assert.equal((event.fullDocument as UserDoc | undefined)?.name, 'bob');
            assert.ok(watcher);
            assert.equal(typeof watcher.on, 'function');
            assert.equal(typeof watcher.close, 'function');
        } finally {
            if (watcher) {
                await watcher.close().catch(() => undefined);
            }
            await msq.close();
        }
    });
});