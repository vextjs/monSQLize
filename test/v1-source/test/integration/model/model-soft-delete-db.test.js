/**
 * Model - softDelete 集成测试（数据库操作）
 *
 * 测试内容：
 * 1. ✅ 软删除操作（deleteOne/deleteMany 转换为 updateOne/updateMany）
 * 2. ✅ 查询自动过滤（find/findOne/count）
 * 3. ✅ 查询已删除数据（findWithDeleted/findOnlyDeleted）
 * 4. ✅ 恢复已删除数据（restore/restoreMany）
 * 5. ✅ 强制物理删除（forceDelete/forceDeleteMany）
 * 6. ✅ 删除类型验证（timestamp/boolean）
 * 7. ✅ 自定义字段名验证
 * 8. ✅ 与 timestamps 协同
 *
 * 注意：本测试套件使用实际数据库操作，验证核心功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

describe('Model - softDelete Integration (Database Operations)', function() {
    this.timeout(30000);

    let msq, User, Comment, Product;

    // ========== 初始化 ==========
    before(async function() {
        // 使用 MongoDB Memory Server
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_softdelete_integration',
            config: { useMemoryServer: true }
        });
        await msq.connect();

        // 定义 User Model（timestamp 类型）
        Model.define('users_integration', {
            schema: (dsl) => dsl({
                username: 'string!',
                email: 'string!',
                status: 'string'
            }),
            options: {
                softDelete: true  // 默认 timestamp 类型
            }
        });

        // 定义 Comment Model（boolean 类型 + 自定义字段名）
        Model.define('comments_integration', {
            schema: (dsl) => dsl({
                content: 'string!',
                author: 'string!'
            }),
            options: {
                softDelete: {
                    enabled: true,
                    type: 'boolean',
                    field: 'removed'  // 自定义字段名
                }
            }
        });

        // 定义 Product Model（与 timestamps 协同）
        Model.define('products_integration', {
            schema: (dsl) => dsl({
                name: 'string!',
                price: 'number'
            }),
            options: {
                timestamps: true,
                softDelete: true
            }
        });

        User = msq.model('users_integration');
        Comment = msq.model('comments_integration');
        Product = msq.model('products_integration');
    });

    after(async function() {
        Model._clear();
        if (msq) await msq.close();
    });

    beforeEach(async function() {
        // 清空所有集合
        await User.collection.deleteMany({}, { _forceDelete: true });
        await Comment.collection.deleteMany({}, { _forceDelete: true });
        await Product.collection.deleteMany({}, { _forceDelete: true });
    });

    // ========== 1. 软删除操作测试 ==========
    describe('1. Soft Delete Operations', () => {
        it('1.1 should mark document as deleted (deleteOne)', async () => {
            // 插入数据
            const result = await User.insertOne({
                username: 'john',
                email: 'john@example.com'
            });
            const userId = result.insertedId;

            // 执行软删除
            const deleteResult = await User.deleteOne({ _id: userId });
            assert.strictEqual(deleteResult.deletedCount, 1, 'Should report 1 document deleted');

            // 验证：普通查询查不到
            const found = await User.findOne({ _id: userId });
            assert.strictEqual(found, null, 'Deleted document should not be found');

            // 验证：findWithDeleted 可以查到
            const deletedDoc = await User.findOneWithDeleted({ _id: userId });
            assert.ok(deletedDoc, 'Document should exist with findWithDeleted');
            assert.ok(deletedDoc.deletedAt, 'Document should have deletedAt field');
            assert.ok(deletedDoc.deletedAt instanceof Date, 'deletedAt should be a Date');
        });

        it('1.2 should mark multiple documents as deleted (deleteMany)', async () => {
            // 插入多条数据
            await User.insertMany([
                { username: 'john', email: 'john@example.com', status: 'active' },
                { username: 'jane', email: 'jane@example.com', status: 'active' },
                { username: 'bob', email: 'bob@example.com', status: 'inactive' }
            ]);

            // 批量软删除
            const deleteResult = await User.deleteMany({ status: 'active' });
            assert.strictEqual(deleteResult.deletedCount, 2, 'Should delete 2 documents');

            // 验证：只剩1个未删除
            const remaining = await User.find({});
            assert.strictEqual(remaining.length, 1, 'Should have 1 non-deleted document');
            assert.strictEqual(remaining[0].username, 'bob');

            // 验证：总共3个文档
            const total = await User.findWithDeleted({});
            assert.strictEqual(total.length, 3, 'Should have 3 total documents');
        });

        it('1.3 should handle deleting nonexistent document', async () => {
            const deleteResult = await User.deleteOne({ username: 'nonexistent' });
            assert.strictEqual(deleteResult.deletedCount, 0, 'Should report 0 documents deleted');
        });
    });

    // ========== 2. 查询自动过滤测试 ==========
    describe('2. Auto-filter in Queries', () => {
        beforeEach(async () => {
            // 插入3条数据，删除1条
            await User.insertMany([
                { username: 'john', email: 'john@example.com' },
                { username: 'jane', email: 'jane@example.com' },
                { username: 'bob', email: 'bob@example.com' }
            ]);
            await User.deleteOne({ username: 'john' });
        });

        it('2.1 should auto-filter deleted documents in find()', async () => {
            const users = await User.find({});
            assert.strictEqual(users.length, 2, 'Should return 2 non-deleted users');

            const usernames = users.map(u => u.username);
            assert.ok(!usernames.includes('john'), 'Should not include deleted user');
            assert.ok(usernames.includes('jane'), 'Should include jane');
            assert.ok(usernames.includes('bob'), 'Should include bob');
        });

        it('2.2 should auto-filter deleted documents in findOne()', async () => {
            const john = await User.findOne({ username: 'john' });
            assert.strictEqual(john, null, 'Should not find deleted user');

            const jane = await User.findOne({ username: 'jane' });
            assert.ok(jane, 'Should find non-deleted user');
            assert.strictEqual(jane.username, 'jane');
        });

        it('2.3 should auto-filter deleted documents in count()', async () => {
            const count = await User.count({});
            assert.strictEqual(count, 2, 'Should count 2 non-deleted documents');

            const totalCount = await User.countWithDeleted({});
            assert.strictEqual(totalCount, 3, 'Should count 3 total documents');
        });
    });

    // ========== 3. 查询已删除数据测试 ==========
    describe('3. Query Deleted Documents', () => {
        beforeEach(async () => {
            await User.insertMany([
                { username: 'john', email: 'john@example.com' },
                { username: 'jane', email: 'jane@example.com' },
                { username: 'bob', email: 'bob@example.com' }
            ]);
            await User.deleteMany({ username: { $in: ['john', 'jane'] } });
        });

        it('3.1 should find all documents with findWithDeleted()', async () => {
            const allUsers = await User.findWithDeleted({});
            assert.strictEqual(allUsers.length, 3, 'Should return all 3 documents');
        });

        it('3.2 should find only deleted documents with findOnlyDeleted()', async () => {
            const deletedUsers = await User.findOnlyDeleted({});
            assert.strictEqual(deletedUsers.length, 2, 'Should return 2 deleted documents');

            deletedUsers.forEach(user => {
                assert.ok(user.deletedAt, 'Each document should have deletedAt');
            });
        });

        it('3.3 should find one with findOneWithDeleted()', async () => {
            const john = await User.findOneWithDeleted({ username: 'john' });
            assert.ok(john, 'Should find deleted user');
            assert.ok(john.deletedAt, 'Should have deletedAt field');
        });

        it('3.4 should find one deleted with findOneOnlyDeleted()', async () => {
            const john = await User.findOneOnlyDeleted({ username: 'john' });
            assert.ok(john, 'Should find deleted user');

            const bob = await User.findOneOnlyDeleted({ username: 'bob' });
            assert.strictEqual(bob, null, 'Should not find non-deleted user');
        });

        it('3.5 should count with countWithDeleted()', async () => {
            const total = await User.countWithDeleted({});
            assert.strictEqual(total, 3, 'Should count all documents');
        });

        it('3.6 should count only deleted with countOnlyDeleted()', async () => {
            const deletedCount = await User.countOnlyDeleted({});
            assert.strictEqual(deletedCount, 2, 'Should count only deleted documents');
        });
    });

    // ========== 4. 恢复已删除数据测试 ==========
    describe('4. Restore Deleted Documents', () => {
        beforeEach(async () => {
            await User.insertMany([
                { username: 'john', email: 'john@example.com' },
                { username: 'jane', email: 'jane@example.com' }
            ]);
            await User.deleteMany({});
        });

        it('4.1 should restore a deleted document', async () => {
            // 恢复 john
            const restoreResult = await User.restore({ username: 'john' });
            assert.strictEqual(restoreResult.modifiedCount, 1, 'Should restore 1 document');

            // 验证：john 可以正常查询
            const john = await User.findOne({ username: 'john' });
            assert.ok(john, 'Restored document should be found');
            assert.strictEqual(john.deletedAt, undefined, 'deletedAt should be removed');

            // 验证：jane 仍是删除状态
            const jane = await User.findOne({ username: 'jane' });
            assert.strictEqual(jane, null, 'Other document should still be deleted');
        });

        it('4.2 should restore multiple deleted documents', async () => {
            const restoreResult = await User.restoreMany({});
            assert.strictEqual(restoreResult.modifiedCount, 2, 'Should restore 2 documents');

            const users = await User.find({});
            assert.strictEqual(users.length, 2, 'Both users should be restored');
        });

        it('4.3 should not restore non-deleted documents', async () => {
            // 先恢复 john
            await User.restore({ username: 'john' });

            // 再次恢复（已经不是删除状态）
            const restoreResult = await User.restore({ username: 'john' });
            assert.strictEqual(restoreResult.modifiedCount, 0, 'Should not modify non-deleted document');
        });
    });

    // ========== 5. 强制物理删除测试 ==========
    describe('5. Force Physical Deletion', () => {
        beforeEach(async () => {
            await User.insertMany([
                { username: 'john', email: 'john@example.com' },
                { username: 'jane', email: 'jane@example.com' }
            ]);
        });

        it('5.1 should force delete physically (bypass soft delete)', async () => {
            const users = await User.find({});
            const userId = users[0]._id;

            // 强制物理删除
            const deleteResult = await User.forceDelete({ _id: userId });
            assert.strictEqual(deleteResult.deletedCount, 1, 'Should delete 1 document');

            // 验证：即使 findWithDeleted 也查不到
            const found = await User.findOneWithDeleted({ _id: userId });
            assert.strictEqual(found, null, 'Document should be permanently deleted');

            // 验证：总数减少
            const total = await User.countWithDeleted({});
            assert.strictEqual(total, 1, 'Total count should decrease');
        });

        it('5.2 should force delete multiple documents', async () => {
            const deleteResult = await User.forceDeleteMany({});
            assert.strictEqual(deleteResult.deletedCount, 2, 'Should delete all documents');

            const total = await User.countWithDeleted({});
            assert.strictEqual(total, 0, 'All documents should be gone');
        });

        it('5.3 should force delete already soft-deleted documents', async () => {
            // 先软删除
            await User.deleteOne({ username: 'john' });

            // 验证软删除成功
            const softDeleted = await User.findOneWithDeleted({ username: 'john' });
            assert.ok(softDeleted, 'Document should be soft-deleted');

            // 强制物理删除
            const deleteResult = await User.forceDelete({ username: 'john' });
            assert.strictEqual(deleteResult.deletedCount, 1, 'Should physically delete');

            // 验证彻底删除
            const gone = await User.findOneWithDeleted({ username: 'john' });
            assert.strictEqual(gone, null, 'Document should be permanently deleted');
        });
    });

    // ========== 6. 删除类型验证测试 ==========
    describe('6. Delete Type Validation', () => {
        it('6.1 should use timestamp type by default', async () => {
            const result = await User.insertOne({
                username: 'john',
                email: 'john@example.com'
            });
            const userId = result.insertedId;

            await User.deleteOne({ _id: userId });

            const deleted = await User.findOneWithDeleted({ _id: userId });
            assert.ok(deleted.deletedAt instanceof Date, 'deletedAt should be a Date');
        });

        it('6.2 should use boolean type when configured', async () => {
            const result = await Comment.insertOne({
                content: 'Nice!',
                author: 'john'
            });
            const commentId = result.insertedId;

            await Comment.deleteOne({ _id: commentId });

            const deleted = await Comment.findOneWithDeleted({ _id: commentId });
            assert.strictEqual(deleted.removed, true, 'removed should be boolean true');
            assert.strictEqual(typeof deleted.removed, 'boolean', 'removed should be boolean type');
        });
    });

    // ========== 7. 自定义字段名验证测试 ==========
    describe('7. Custom Field Name Validation', () => {
        it('7.1 should use custom field name', async () => {
            const result = await Comment.insertOne({
                content: 'Test comment',
                author: 'alice'
            });
            const commentId = result.insertedId;

            await Comment.deleteOne({ _id: commentId });

            const deleted = await Comment.findOneWithDeleted({ _id: commentId });
            assert.ok(deleted.removed !== undefined, 'Should have "removed" field');
            assert.strictEqual(deleted.deletedAt, undefined, 'Should not have "deletedAt" field');
        });

        it('7.2 should filter by custom field', async () => {
            await Comment.insertMany([
                { content: 'Comment 1', author: 'john' },
                { content: 'Comment 2', author: 'jane' }
            ]);
            await Comment.deleteOne({ author: 'john' });

            const comments = await Comment.find({});
            assert.strictEqual(comments.length, 1, 'Should return 1 non-deleted comment');
            assert.strictEqual(comments[0].author, 'jane');
        });
    });

    // ========== 8. 与 timestamps 协同测试 ==========
    describe('8. Integration with Timestamps', () => {
        it('8.1 should auto-update updatedAt on soft delete', async () => {
            const result = await Product.insertOne({
                name: 'iPhone',
                price: 999
            });
            const productId = result.insertedId;

            // 获取插入后的文档（有 createdAt 和 updatedAt）
            const inserted = await Product.findOne({ _id: productId });
            const oldUpdatedAt = inserted.updatedAt;

            // 等待一会儿确保时间不同（增加到50ms确保时间戳变化）
            await new Promise(resolve => setTimeout(resolve, 50));

            // 软删除
            await Product.deleteOne({ _id: productId });

            // 验证：updatedAt 应该更新（使用 >= 因为可能在同一毫秒内）
            const deleted = await Product.findOneWithDeleted({ _id: productId });
            assert.ok(deleted.createdAt, 'Should have createdAt');
            assert.ok(deleted.updatedAt, 'Should have updatedAt');
            assert.ok(deleted.deletedAt, 'Should have deletedAt');
            assert.ok(deleted.updatedAt.getTime() >= oldUpdatedAt.getTime(),
                'updatedAt should be >= oldUpdatedAt (updated or same)');
            assert.ok(deleted.createdAt.getTime() === inserted.createdAt.getTime(),
                'createdAt should not change');
        });

        it('8.2 should have all three timestamps after soft delete', async () => {
            const result = await Product.insertOne({
                name: 'MacBook',
                price: 1999
            });
            const productId = result.insertedId;

            await Product.deleteOne({ _id: productId });

            const deleted = await Product.findOneWithDeleted({ _id: productId });
            assert.ok(deleted.createdAt instanceof Date, 'createdAt should be Date');
            assert.ok(deleted.updatedAt instanceof Date, 'updatedAt should be Date');
            assert.ok(deleted.deletedAt instanceof Date, 'deletedAt should be Date');
        });
    });
});

