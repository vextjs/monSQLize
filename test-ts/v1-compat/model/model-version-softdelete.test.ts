import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import MonSQLize from 'monsqlize';

const { createMemoryServerBootstrap } = require(path.join(process.cwd(), 'test', 'bootstrap', 'memory-server'));

type VersionedDoc = {
    name: string;
    score: number;
    version?: number;
    createdAt?: Date;
    updatedAt?: Date;
};

function schema(shape: Record<string, string>) {
    return (dsl: unknown) => (dsl as (input: Record<string, string>) => Record<string, unknown>)(shape);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Stage B model version/timestamps/softDelete TS migration', () => {
    const bootstrap = createMemoryServerBootstrap({ dbName: 'monsqlize_stage_b_model_version' });
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

    it('insert/update/delete 应保持 version + timestamps + softDelete 运行时主链稳定', async () => {
        const modelName = `stage_b_versioned_${Date.now()}`;

        MonSQLize.Model.define(modelName, {
            schema: schema({ name: 'string!', score: 'number' }),
            options: {
                timestamps: true,
                softDelete: true,
                version: true,
            },
        });

        const msq = new MonSQLize({
            type: 'mongodb',
            databaseName: `stage_b_model_version_${Date.now()}`,
            config: { uri },
        });

        try {
            await msq.connect();
            const Users = msq.model<VersionedDoc>(modelName);

            const inserted = await Users.insertOne({ name: 'john', score: 100 });
            const created = await Users.findOne({ _id: inserted.insertedId }) as (VersionedDoc & Record<string, unknown>) | null;

            assert.ok(created);
            assert.equal(created?.version, 0);
            assert.equal(created?.createdAt instanceof Date, true);
            assert.equal(created?.updatedAt instanceof Date, true);

            const initialUpdatedAt = created?.updatedAt as Date;
            await wait(5);

            await Users.updateOne({ _id: inserted.insertedId }, { $set: { score: 150 } });
            const updated = await Users.findOne({ _id: inserted.insertedId }) as (VersionedDoc & Record<string, unknown>) | null;

            assert.ok(updated);
            assert.equal(updated?.score, 150);
            assert.equal(updated?.version, 1);
            assert.equal((updated?.updatedAt as Date).getTime() >= initialUpdatedAt.getTime(), true);

            await Users.deleteOne({ _id: inserted.insertedId });
            assert.equal(await Users.findOne({ _id: inserted.insertedId }), null);

            const deleted = await Users.findOneWithDeleted({ _id: inserted.insertedId }) as (VersionedDoc & Record<string, unknown>) | null;
            assert.ok(deleted);
            assert.equal(await Users.countOnlyDeleted({}), 1);

            await Users.restore({ _id: inserted.insertedId });
            const restored = await Users.findOne({ _id: inserted.insertedId }) as (VersionedDoc & Record<string, unknown>) | null;
            assert.ok(restored);
            assert.equal(restored?.version, 1);
        } finally {
            await msq.close();
        }
    });
});