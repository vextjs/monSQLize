/**
 * findByIds 方法完整测试套件
 * 测试批量通过 _id 查询多个文档的功能
 */

const MonSQLize = require('../../../lib');
const { ObjectId } = require('mongodb');
const assert = require('assert');

describe('findByIds 方法测试套件', function () {
    this.timeout(30000);

    let msq;
    let collection;
    let nativeCollection;
    let testIds = [];

    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_findbyids',
            config: { useMemoryServer: true },
            slowQueryMs: 1000
        });

        const conn = await msq.connect();
        collection = conn.collection;

        const db = msq._adapter.db;
        nativeCollection = db.collection('test_users');

        // 插入测试数据
        await nativeCollection.deleteMany({});
        const insertResult = await nativeCollection.insertMany([
            { name: 'Alice', age: 30, role: 'admin' },
            { name: 'Bob', age: 25, role: 'user' },
            { name: 'Charlie', age: 35, role: 'user' },
            { name: 'David', age: 28, role: 'moderator' },
            { name: 'Eve', age: 32, role: 'user' }
        ]);

        testIds = Object.values(insertResult.insertedIds);
        console.log('✅ 测试环境准备完成，插入了 5 个测试文档');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (nativeCollection) {
            await nativeCollection.deleteMany({});
        }
        if (msq) {
            await msq.close();
        }
        console.log('✅ 测试环境清理完成');
    });

    describe('1. 基础功能测试', function () {
        it('1.1 应该批量查询多个文档（字符串 ID）', async function () {
            const stringIds = [testIds[0].toString(), testIds[1].toString(), testIds[2].toString()];
            const results = await collection('test_users').findByIds(stringIds);

            assert.strictEqual(results.length, 3, '应该返回 3 个文档');
            const names = results.map(doc => doc.name).sort();
            assert.deepStrictEqual(names, ['Alice', 'Bob', 'Charlie'], '应该返回正确的文档');
        });

        it('1.2 应该批量查询多个文档（ObjectId）', async function () {
            const objectIds = [testIds[0], testIds[1], testIds[2]];
            const results = await collection('test_users').findByIds(objectIds);

            assert.strictEqual(results.length, 3);
            const names = results.map(doc => doc.name).sort();
            assert.deepStrictEqual(names, ['Alice', 'Bob', 'Charlie']);
        });

        it('1.3 应该支持混合类型（字符串 + ObjectId）', async function () {
            const mixedIds = [testIds[0].toString(), testIds[1], testIds[2].toString()];
            const results = await collection('test_users').findByIds(mixedIds);

            assert.strictEqual(results.length, 3);
        });

        it('1.4 应该自动去重（重复的 ID）', async function () {
            const duplicateIds = [
                testIds[0].toString(),
                testIds[0].toString(),  // 重复
                testIds[1].toString(),
                testIds[1].toString()   // 重复
            ];
            const results = await collection('test_users').findByIds(duplicateIds);

            assert.strictEqual(results.length, 2, '应该去重，只返回 2 个文档');
        });

        it('1.5 应该处理空数组', async function () {
            const results = await collection('test_users').findByIds([]);
            assert.deepStrictEqual(results, [], '空数组应该返回空结果');
        });

        it('1.6 应该处理不存在的 ID', async function () {
            const nonExistentId = new ObjectId();
            const results = await collection('test_users').findByIds([
                testIds[0].toString(),
                nonExistentId.toString(),  // 不存在
                testIds[1].toString()
            ]);

            assert.strictEqual(results.length, 2, '应该只返回存在的文档');
        });
    });

    describe('2. 选项支持测试', function () {
        it('2.1 应该支持 projection 选项', async function () {
            const results = await collection('test_users').findByIds(
                [testIds[0].toString(), testIds[1].toString()],
                { projection: { name: 1, age: 1 } }
            );

            assert.strictEqual(results.length, 2);
            results.forEach(doc => {
                assert.ok(doc._id, '_id 应该存在');
                assert.ok(doc.name, 'name 应该存在');
                assert.ok(doc.age !== undefined, 'age 应该存在');
                assert.strictEqual(doc.role, undefined, 'role 不应该存在');
            });
        });

        it('2.2 应该支持 sort 选项', async function () {
            const results = await collection('test_users').findByIds(
                [testIds[0].toString(), testIds[1].toString(), testIds[2].toString()],
                { sort: { age: 1 } }  // 按年龄升序
            );

            assert.strictEqual(results.length, 3);
            // 验证排序（Bob 25, Alice 30, Charlie 35）
            assert.strictEqual(results[0].name, 'Bob');
            assert.strictEqual(results[1].name, 'Alice');
            assert.strictEqual(results[2].name, 'Charlie');
        });

        it('2.3 应该支持 maxTimeMS 选项', async function () {
            const results = await collection('test_users').findByIds(
                [testIds[0].toString()],
                { maxTimeMS: 5000 }
            );

            assert.strictEqual(results.length, 1);
        });

        it('2.4 应该支持 comment 选项', async function () {
            const results = await collection('test_users').findByIds(
                [testIds[0].toString()],
                { comment: 'test-findByIds' }
            );

            assert.strictEqual(results.length, 1);
        });

        it('2.5 应该支持 preserveOrder 选项（保持顺序）', async function () {
            const orderedIds = [testIds[2].toString(), testIds[0].toString(), testIds[1].toString()];
            const results = await collection('test_users').findByIds(orderedIds, {
                preserveOrder: true
            });

            assert.strictEqual(results.length, 3);
            // 验证结果顺序与输入顺序一致
            assert.strictEqual(results[0]._id.toString(), testIds[2].toString());
            assert.strictEqual(results[1]._id.toString(), testIds[0].toString());
            assert.strictEqual(results[2]._id.toString(), testIds[1].toString());
        });
    });

    describe('3. 参数验证测试', function () {
        it('3.1 应该拒绝非数组 ids', async function () {
            try {
                await collection('test_users').findByIds('invalid');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('ids 必须是数组'));
            }
        });

        it('3.2 应该拒绝 null ids', async function () {
            try {
                await collection('test_users').findByIds(null);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('ids 必须是数组'));
            }
        });

        it('3.3 应该拒绝无效的 ObjectId 格式', async function () {
            try {
                await collection('test_users').findByIds(['invalid-id', testIds[0].toString()]);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('无效 ID'));
            }
        });

        it('3.4 应该拒绝非字符串非 ObjectId 的元素', async function () {
            try {
                await collection('test_users').findByIds([testIds[0], 123, testIds[1]]);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('无效 ID'));
            }
        });

        it('3.5 应该拒绝包含 undefined 的数组', async function () {
            try {
                await collection('test_users').findByIds([testIds[0], undefined, testIds[1]]);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('无效 ID'));
            }
        });
    });

    describe('4. 缓存测试', function () {
        it('4.1 应该支持缓存', async function () {
            const cache = msq.getCache();
            if (!cache) {
                this.skip();
                return;
            }

            const ids = [testIds[0].toString(), testIds[1].toString()];

            // 第一次查询（写入缓存）
            const results1 = await collection('test_users').findByIds(ids, { cache: 10000 });
            assert.strictEqual(results1.length, 2);

            // 第二次查询（从缓存读取）
            const results2 = await collection('test_users').findByIds(ids, { cache: 10000 });
            assert.strictEqual(results2.length, 2);
            assert.deepStrictEqual(results1, results2);
        });

        it('4.2 不同查询应该使用不同缓存键', async function () {
            const cache = msq.getCache();
            if (!cache) {
                this.skip();
                return;
            }

            // 查询 1
            const results1 = await collection('test_users').findByIds(
                [testIds[0].toString()],
                { cache: 10000 }
            );

            // 查询 2（不同 IDs）
            const results2 = await collection('test_users').findByIds(
                [testIds[1].toString()],
                { cache: 10000 }
            );

            assert.strictEqual(results1.length, 1);
            assert.strictEqual(results2.length, 1);
            assert.notEqual(results1[0]._id.toString(), results2[0]._id.toString());
        });
    });

    describe('5. 性能和边界测试', function () {
        it('5.1 应该处理大批量 ID（100 个）', async function () {
            // 插入 100 个文档
            const docs = Array(100).fill(0).map((_, i) => ({ name: `User${i}`, value: i }));
            const insertResult = await nativeCollection.insertMany(docs);
            const ids = Object.values(insertResult.insertedIds);

            const results = await collection('test_users').findByIds(ids.map(id => id.toString()));

            assert.strictEqual(results.length, 100);

            // 清理
            await nativeCollection.deleteMany({ name: /^User\d+$/ });
        });

        it('5.2 应该处理只有一个 ID', async function () {
            const results = await collection('test_users').findByIds([testIds[0].toString()]);
            assert.strictEqual(results.length, 1);
        });

        it('5.3 应该处理全部不存在的 ID', async function () {
            const nonExistentIds = [
                new ObjectId().toString(),
                new ObjectId().toString(),
                new ObjectId().toString()
            ];
            const results = await collection('test_users').findByIds(nonExistentIds);
            assert.strictEqual(results.length, 0, '应该返回空数组');
        });
    });

    describe('6. 实际应用场景', function () {
        it('6.1 批量查询用户资料（关联查询场景）', async function () {
            // 模拟从评论中提取用户 ID
            const commentUserIds = [testIds[0], testIds[1], testIds[2]];

            const users = await collection('test_users').findByIds(
                commentUserIds.map(id => id.toString()),
                { projection: { name: 1, role: 1 } }
            );

            assert.strictEqual(users.length, 3);
            users.forEach(user => {
                assert.ok(user.name);
                assert.ok(user.role);
            });
        });

        it('6.2 批量权限验证', async function () {
            // 检查多个用户是否为管理员
            const userIds = [testIds[0], testIds[1], testIds[3]];
            const users = await collection('test_users').findByIds(
                userIds.map(id => id.toString()),
                { projection: { role: 1 } }
            );

            const admins = users.filter(user => user.role === 'admin');
            assert.strictEqual(admins.length, 1, '应该只有 1 个管理员');
        });

        it('6.3 批量数据导出（保持顺序）', async function () {
            const orderedIds = [testIds[4], testIds[2], testIds[0]];  // Eve, Charlie, Alice
            const users = await collection('test_users').findByIds(
                orderedIds.map(id => id.toString()),
                {
                    projection: { name: 1, age: 1 },
                    preserveOrder: true
                }
            );

            assert.strictEqual(users.length, 3);
            assert.strictEqual(users[0].name, 'Eve');
            assert.strictEqual(users[1].name, 'Charlie');
            assert.strictEqual(users[2].name, 'Alice');
        });
    });

    describe('7. 与 findOneById 对比', function () {
        it('7.1 findByIds 应该等价于多次 findOneById', async function () {
            const ids = [testIds[0], testIds[1]];

            // 使用 findByIds
            const results1 = await collection('test_users').findByIds(ids.map(id => id.toString()));

            // 使用多次 findOneById
            const results2 = await Promise.all(
                ids.map(id => collection('test_users').findOneById(id))
            );

            assert.strictEqual(results1.length, results2.length);

            // 排序后比较（因为 findByIds 顺序可能不同）
            const sorted1 = results1.sort((a, b) => a.name.localeCompare(b.name));
            const sorted2 = results2.sort((a, b) => a.name.localeCompare(b.name));

            sorted1.forEach((doc, i) => {
                assert.strictEqual(doc._id.toString(), sorted2[i]._id.toString());
            });
        });

        it('7.2 findByIds 性能应该优于多次 findOneById', async function () {
            const ids = testIds.slice(0, 5);

            // 测试 findByIds 性能
            const start1 = Date.now();
            await collection('test_users').findByIds(ids.map(id => id.toString()));
            const duration1 = Date.now() - start1;

            // 测试多次 findOneById 性能
            const start2 = Date.now();
            await Promise.all(ids.map(id => collection('test_users').findOneById(id)));
            const duration2 = Date.now() - start2;

            console.log(`  findByIds: ${duration1}ms, findOneById x5: ${duration2}ms`);
            // findByIds 应该更快（1 次查询 vs 5 次查询）
            assert.ok(duration1 <= duration2 * 1.5, 'findByIds 应该更快或相当');
        });
    });
});

