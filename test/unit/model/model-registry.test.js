const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P3-C model registry', () => {
    afterEach(() => {
        MonSQLize.Model._clear();
    });

    it('应支持 define/get/list/redefine/undefine', () => {
        MonSQLize.Model.define('users', {
            schema: (dsl) => dsl({}),
            defaults: { status: 'active' },
            relations: {
                posts: {
                    from: 'posts',
                    localField: '_id',
                    foreignField: 'authorId',
                },
            },
        });

        assert.equal(MonSQLize.Model.has('users'), true);
        assert.deepEqual(MonSQLize.Model.list(), ['users']);
        assert.deepEqual(MonSQLize.Model.get('users').definition.defaults, { status: 'active' });

        MonSQLize.Model.redefine('users', {
            schema: (dsl) => dsl({}),
            virtuals: {
                displayName: {
                    get() {
                        return `${this.firstName} ${this.lastName}`;
                    },
                },
            },
        });

        assert.equal(typeof MonSQLize.Model.get('users').definition.virtuals.displayName.get, 'function');
        assert.equal(MonSQLize.Model.undefine('users'), true);
        assert.equal(MonSQLize.Model.has('users'), false);
    });

    it('应拒绝非法集合名与非法 relation 配置', () => {
        assert.throws(
            () => MonSQLize.Model.define('bad name', { defaults: {} }),
            (error) => error && error.code === 'INVALID_COLLECTION_NAME',
        );

        assert.throws(
            () => MonSQLize.Model.define('users', {
                schema: (dsl) => dsl({}),
                relations: {
                    posts: {
                        from: 'posts',
                        localField: '_id',
                        foreignField: 123,
                    },
                },
            }),
            (error) => error && error.code === 'INVALID_ARGUMENT',
        );
    });
});

