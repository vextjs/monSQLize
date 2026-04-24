/**
 * Model._clear() 缓存失效回归测试
 *
 * 背景：
 *   v1.2.1 引入了 msq.model() 实例缓存（_modelInstances Map）以避免重复构建
 *   ModelInstance。缓存失效机制依赖 Model._redefinedNames — 只有名字在集合里，
 *   才会在下次 msq.model() 调用时重建实例。
 *
 *   但 _clear() 同时清空了 _registry 和 _redefinedNames：
 *
 *     static _clear() {
 *       this._registry.clear();
 *       this._redefinedNames.clear();  // ← 问题所在
 *     }
 *
 *   这导致：_clear() → define() 后，_redefinedNames 里没有任何名字，
 *   msq.model() 认为缓存仍然有效，直接返回旧 ModelInstance。
 *   旧实例的 _relations 不含重新注册的关系，populate() 抛出
 *   "未定义的关系: xxx"。
 *
 * 修复（v1.2.2）：
 *   _clear() 先将 _registry 里所有名字写入 _redefinedNames，
 *   再清空 _registry，不清 _redefinedNames。
 *
 * 本文件测试范围：
 *   1. _clear() 后 _redefinedNames 包含已注册的所有名字
 *   2. _clear() 后 _registry 为空
 *   3. _clear() → define() 后 msq.model() 返回全新 ModelInstance
 *   4. 新 ModelInstance 包含最新的 relations，不再抛出"未定义的关系"
 *   5. 多次 _clear() / define() 循环保持正确
 *   6. 向后兼容：未配置 relations 时 populate 报错行为不变
 *
 * @module test/unit/model/model-clear-invalidation.test.js
 * @since v1.2.2
 */

const assert = require('assert');
const { describe, it, beforeEach } = require('mocha');
const MonSQLize = require('../../../lib/index');
const { Model } = require('../../../lib/index');

// ============================================================
// 工具函数
// ============================================================

/**
 * 构造最简 mock msq 实例，绑定真实的 model() 方法。
 * collection() 返回可链式调用的 mock，供 ModelInstance 内部使用。
 */
function makeMockMsq({ databaseName = 'test_db' } = {}) {
    // mock collection — find().toArray() 返回空数组
    function makeCollection(name) {
        return {
            collectionName: name,
            find() {
                return {
                    toArray: async () => [],
                    limit() { return this; },
                    skip() { return this; },
                    sort() { return this; }
                };
            },
            findOne: async () => null
        };
    }

    const msq = {
        databaseName,
        dbInstance: {
            collection: (name) => makeCollection(name),
            db(dbName) {
                return { collection: (name) => makeCollection(name) };
            }
        },
        _adapter: null,
        _poolManager: null,
        _modelInstances: null,
        // 供 populate 路径查询关联集合
        collection: (name) => makeCollection(name)
    };

    // 绑定真实实现
    msq.model = MonSQLize.prototype.model.bind(msq);
    msq._resolveModelCollection = MonSQLize.prototype._resolveModelCollection.bind(msq);

    return msq;
}

// ============================================================
// 测试套件
// ============================================================

describe('Model._clear() 缓存失效回归测试 (v1.2.2)', function () {

    beforeEach(function () {
        Model._clear();
    });

    // ----------------------------------------------------------
    // 分组 1：_clear() 内部状态正确性
    // ----------------------------------------------------------
    describe('1. _clear() 内部状态', function () {

        it('_clear() 前注册 N 个 Model，_clear() 后 _registry 为空', function () {
            Model.define('users',  { schema: (dsl) => dsl({ name: 'string!' }) });
            Model.define('posts',  { schema: (dsl) => dsl({ title: 'string!' }) });
            Model.define('orders', { schema: (dsl) => dsl({ amount: 'number' }) });

            assert.strictEqual(Model.list().length, 3);

            Model._clear();

            assert.strictEqual(Model.list().length, 0);
        });

        it('_clear() 后 _redefinedNames 包含清空前所有已注册名', function () {
            Model.define('users', { schema: (dsl) => dsl({ name: 'string!' }) });
            Model.define('posts', { schema: (dsl) => dsl({ title: 'string!' }) });

            Model._clear();

            assert.ok(
                Model._redefinedNames.has('users'),
                '_redefinedNames 应包含 "users"'
            );
            assert.ok(
                Model._redefinedNames.has('posts'),
                '_redefinedNames 应包含 "posts"'
            );
        });

        it('_clear() 对空注册表调用，_redefinedNames 保持空集合', function () {
            // 此时 beforeEach 已 _clear()，_redefinedNames 只含上一个 beforeEach 的残留
            // 再手动清理后从空开始
            Model._redefinedNames.clear();

            Model._clear(); // 空注册表 → 不向 _redefinedNames 添加任何内容

            assert.strictEqual(Model._redefinedNames.size, 0);
        });

        it('重复 _clear() 不出错，_redefinedNames 仍正确', function () {
            Model.define('users', { schema: (dsl) => dsl({ name: 'string!' }) });

            Model._clear();
            Model._clear(); // 第二次 clear 对空注册表，不应崩溃

            // 第一次 clear 时 'users' 应已加入
            assert.ok(Model._redefinedNames.has('users'));
        });
    });

    // ----------------------------------------------------------
    // 分组 2：msq.model() 缓存失效
    // ----------------------------------------------------------
    describe('2. msq.model() 实例缓存在 _clear() 后正确失效', function () {

        it('_clear() 前后 msq.model() 返回不同实例', function () {
            const msq = makeMockMsq();

            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            const instanceBefore = msq.model('users');

            // 清空并重新注册
            Model._clear();
            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            const instanceAfter = msq.model('users');

            assert.notStrictEqual(
                instanceBefore,
                instanceAfter,
                '_clear() 后 msq.model() 应返回全新 ModelInstance，而非缓存旧实例'
            );
        });

        it('_clear() 后重新 define 包含 relations，新实例具有该关系', function () {
            const msq = makeMockMsq();

            // 第一次：无 relations
            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string!' })
            });
            const instanceNoRelations = msq.model('users');
            assert.strictEqual(instanceNoRelations._relations.has('posts'), false);

            // _clear() 后重新 define：有 relations
            Model._clear();
            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string!' }),
                relations: {
                    posts: {
                        from: 'posts',
                        localField: '_id',
                        foreignField: 'authorId',
                        single: false
                    }
                }
            });

            const instanceWithRelations = msq.model('users');

            assert.strictEqual(
                instanceWithRelations._relations.has('posts'),
                true,
                '重新注册后的实例应包含 posts 关系'
            );
        });

        it('多次 _clear() → define() 循环，每次都能获得最新实例', function () {
            const msq = makeMockMsq();
            const instances = [];

            for (let i = 0; i < 3; i++) {
                Model._clear();
                Model.define('users', {
                    schema: (dsl) => dsl({ name: 'string!' }),
                    relations: {
                        [`relation_${i}`]: {
                            from: 'other',
                            localField: '_id',
                            foreignField: 'userId',
                            single: false
                        }
                    }
                });
                instances.push(msq.model('users'));
            }

            // 三次获取的实例各不相同
            assert.notStrictEqual(instances[0], instances[1]);
            assert.notStrictEqual(instances[1], instances[2]);

            // 每个实例只有各自循环定义的关系
            assert.strictEqual(instances[0]._relations.has('relation_0'), true);
            assert.strictEqual(instances[0]._relations.has('relation_1'), false);
            assert.strictEqual(instances[1]._relations.has('relation_1'), true);
            assert.strictEqual(instances[2]._relations.has('relation_2'), true);
        });
    });

    // ----------------------------------------------------------
    // 分组 3：populate 不再抛出"未定义的关系"
    // ----------------------------------------------------------
    describe('3. _clear() 后 populate 关系可正常解析', function () {

        it('_clear() 后重新 define 含 posts 关系，populate("posts") 不抛出错误', async function () {
            const msq = makeMockMsq();

            // 第一次：无 posts 关系，获取缓存
            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string!' })
            });
            msq.model('users'); // 建立缓存

            // _clear() → 重新 define 含 posts 关系
            Model._clear();
            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string!' }),
                relations: {
                    posts: {
                        from: 'posts',
                        localField: '_id',
                        foreignField: 'authorId',
                        single: false
                    }
                }
            });

            const User = msq.model('users');

            // 文档为空时 populate 应直接返回空数组，不经过 _populatePath
            // 因此不会触发关系查找逻辑 — 测试"有文档时也能找到关系定义"
            // 手动构造 PopulateBuilder 验证关系可解析
            const { PopulateBuilder } = require('../../../lib/model/features/populate');
            const builder = new PopulateBuilder(User, {});
            builder.populate('posts');

            // 关系定义存在，不会抛出"未定义的关系"
            const relation = User._relations.get('posts');
            assert.ok(relation, 'posts 关系应可从新实例中获取');
            assert.strictEqual(relation.from, 'posts');
            assert.strictEqual(relation.localField, '_id');
            assert.strictEqual(relation.foreignField, 'authorId');
        });

        it('旧实例（_clear() 前缓存）缺少关系，新实例（_clear() 后）包含关系', function () {
            const msq = makeMockMsq();

            // 阶段一：无关系
            Model.define('articles', {
                schema: (dsl) => dsl({ title: 'string!' })
            });
            const oldInstance = msq.model('articles');
            assert.strictEqual(oldInstance._relations.has('comments'), false, '旧实例不应有 comments 关系');

            // 阶段二：_clear() + 重新定义含关系
            Model._clear();
            Model.define('articles', {
                schema: (dsl) => dsl({ title: 'string!' }),
                relations: {
                    comments: {
                        from: 'comments',
                        localField: '_id',
                        foreignField: 'articleId',
                        single: false
                    }
                }
            });
            const newInstance = msq.model('articles');

            assert.strictEqual(newInstance._relations.has('comments'), true, '新实例应有 comments 关系');
            // 两个实例确实不是同一个对象
            assert.notStrictEqual(oldInstance, newInstance);
        });
    });

    // ----------------------------------------------------------
    // 分组 4：向后兼容验证
    // ----------------------------------------------------------
    describe('4. 向后兼容', function () {

        it('未经 _clear() 的正常 define + model()，缓存仍然生效', function () {
            const msq = makeMockMsq();

            Model.define('products', {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            const first  = msq.model('products');
            const second = msq.model('products');

            assert.strictEqual(first, second, '未 _clear() 时同名多次调用应返回同一缓存实例');
        });

        it('redefine() 单个 Model 后，仅该 Model 缓存失效，其他不受影响', function () {
            const msq = makeMockMsq();

            Model.define('users',    { schema: (dsl) => dsl({ name: 'string!' }) });
            Model.define('products', { schema: (dsl) => dsl({ name: 'string!' }) });

            // 清除跨测试残留的 _redefinedNames 条目（由上一个 beforeEach._clear() 写入），
            // 模拟"刚完成 define，无待失效条目"的干净状态。
            Model._redefinedNames.clear();

            const usersBefore    = msq.model('users');
            const productsBefore = msq.model('products');

            // 只 redefine users
            Model.redefine('users', { schema: (dsl) => dsl({ name: 'string!', age: 'number' }) });

            const usersAfter    = msq.model('users');
            const productsAfter = msq.model('products');

            assert.notStrictEqual(usersBefore,    usersAfter,    'redefine 后 users 实例应更新');
            assert.strictEqual   (productsBefore, productsAfter, 'products 未 redefine，缓存应保持');
        });
    });
});
