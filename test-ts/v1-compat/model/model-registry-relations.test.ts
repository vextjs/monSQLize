import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';

function schema(shape: Record<string, string>) {
    return (dsl: unknown) => (dsl as (input: Record<string, string>) => Record<string, unknown>)(shape);
}

describe('Stage B model registry/relations TS migration', () => {
    afterEach(() => {
        MonSQLize.Model._clear();
    });

    it('Model.define/get/list/redefine/undefine 应保持 relation 定义稳定', () => {
        const userModel = `stage_b_users_${Date.now()}`;
        const postModel = `stage_b_posts_${Date.now()}`;

        MonSQLize.Model.define(userModel, {
            schema: schema({ firstName: 'string', lastName: 'string' }),
            defaults: { status: 'active' },
            relations: {
                posts: {
                    from: postModel,
                    localField: '_id',
                    foreignField: 'authorId',
                },
            },
        });

        const registered = MonSQLize.Model.get(userModel);
        assert.ok(registered);
        assert.equal(MonSQLize.Model.has(userModel), true);
        assert.deepEqual(MonSQLize.Model.list(), [userModel]);
        assert.deepEqual(registered?.definition.defaults, { status: 'active' });
        assert.deepEqual(registered?.definition.relations?.posts, {
            from: postModel,
            localField: '_id',
            foreignField: 'authorId',
        });

        MonSQLize.Model.redefine(userModel, {
            schema: schema({ firstName: 'string', lastName: 'string' }),
            virtuals: {
                displayName: {
                    get(this: Record<string, unknown>) {
                        return `${this.firstName ?? ''} ${this.lastName ?? ''}`.trim();
                    },
                },
            },
            options: {
                version: true,
            },
        });

        const redefined = MonSQLize.Model.get(userModel);
        assert.equal(typeof redefined?.definition.virtuals?.displayName.get, 'function');
        assert.equal(redefined?.definition.options?.version, true);

        assert.equal(MonSQLize.Model.undefine(userModel), true);
        assert.equal(MonSQLize.Model.has(userModel), false);
    });

    it('Model.define 应拒绝非法集合名与非法 relation 配置', () => {
        assert.throws(
            () => MonSQLize.Model.define('bad name', { defaults: {} }),
            (error: unknown) => (error as { code?: string; })?.code === 'INVALID_COLLECTION_NAME',
        );

        assert.throws(
            () => MonSQLize.Model.define(`stage_b_invalid_${Date.now()}`, {
                schema: schema({ title: 'string' }),
                relations: {
                    posts: {
                        from: 'posts',
                        localField: '_id',
                        foreignField: 123 as unknown as string,
                    },
                },
            }),
            (error: unknown) => (error as { code?: string; })?.code === 'INVALID_ARGUMENT',
        );
    });
});