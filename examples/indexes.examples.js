/**
 * MongoDB 索引管理完整示例
 *
 * 本示例展示如何使用 monSQLize 的索引管理功能
 * 包括创建、列出、删除索引的各种场景
 *
 * @example
 * node examples/indexes.examples.js
 */

const MonSQLize = require('../lib/index');

// 配置
const config = {
    type: 'mongodb',
    databaseName: 'examples_indexes',
    config: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
    }
};

/**
 * 示例 1: 创建基本索引
 *
 * 演示如何创建最简单的单字段索引
 */
async function example1_basicIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 1: 创建基本索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const users = collection('users');

    try {
        // 清理旧数据
        try { await users.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await users.insertMany([
            { name: 'Alice', email: 'alice@example.com', age: 25 },
            { name: 'Bob', email: 'bob@example.com', age: 30 },
            { name: 'Charlie', email: 'charlie@example.com', age: 35 }
        ]);

        console.log('\n1. 创建升序索引');
        const result1 = await users.createIndex({ email: 1 });
        console.log('✓ 索引创建成功:', result1.name);

        console.log('\n2. 创建降序索引');
        const result2 = await users.createIndex({ age: -1 });
        console.log('✓ 索引创建成功:', result2.name);

        console.log('\n3. 列出所有索引');
        const indexes = await users.listIndexes();
        console.log('✓ 当前索引列表:');
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}:`, idx.key);
        });

        console.log('\n✓ 示例 1 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 2: 创建唯一索引
 *
 * 演示如何创建唯一索引，防止重复数据
 */
async function example2_uniqueIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 2: 创建唯一索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const users = collection('users_unique');

    try {
        // 清理旧数据
        try { await users.drop(); } catch (err) { /* 忽略 */ }

        // 插入初始数据
        await users.insertOne({ email: 'user1@example.com', name: 'User 1' });

        console.log('\n1. 创建唯一邮箱索引');
        const result = await users.createIndex(
            { email: 1 },
            { unique: true, name: 'email_unique' }
        );
        console.log('✓ 唯一索引创建成功:', result.name);

        console.log('\n2. 尝试插入重复邮箱（应该失败）');
        try {
            await users.insertOne({ email: 'user1@example.com', name: 'User 2' });
            console.log('✗ 错误：应该抛出重复键错误');
        } catch (err) {
            console.log('✓ 正确：唯一约束生效，重复邮箱被拒绝');
            console.log('  错误信息:', err.message.substring(0, 80) + '...');
        }

        console.log('\n3. 插入不同邮箱（应该成功）');
        await users.insertOne({ email: 'user2@example.com', name: 'User 2' });
        console.log('✓ 不同邮箱插入成功');

        console.log('\n✓ 示例 2 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 3: 创建复合索引
 *
 * 演示如何创建多字段复合索引，优化复杂查询
 */
async function example3_compoundIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 3: 创建复合索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const orders = collection('orders');

    try {
        // 清理旧数据
        try { await orders.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await orders.insertMany([
            { userId: 'user1', status: 'pending', amount: 100, createdAt: new Date() },
            { userId: 'user1', status: 'completed', amount: 200, createdAt: new Date() },
            { userId: 'user2', status: 'pending', amount: 150, createdAt: new Date() },
            { userId: 'user2', status: 'completed', amount: 300, createdAt: new Date() }
        ]);

        console.log('\n1. 创建复合索引 (userId + status)');
        const result = await orders.createIndex({ userId: 1, status: 1 });
        console.log('✓ 复合索引创建成功:', result.name);

        console.log('\n2. 使用复合索引查询');
        const pendingOrders = await orders.find({ userId: 'user1', status: 'pending' });
        console.log(`✓ 查询结果: 找到 ${pendingOrders.length} 个订单`);

        console.log('\n3. 查询说明');
        console.log('  复合索引适合以下查询:');
        console.log('  - { userId: "user1" }');
        console.log('  - { userId: "user1", status: "pending" }');
        console.log('  但不适合:');
        console.log('  - { status: "pending" } (不包含前缀字段)');

        console.log('\n✓ 示例 3 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 4: 批量创建索引
 *
 * 演示如何一次创建多个索引，提高效率
 */
async function example4_createMultipleIndexes() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 4: 批量创建索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const products = collection('products');

    try {
        // 清理旧数据
        try { await products.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await products.insertMany([
            { name: 'Product 1', category: 'electronics', price: 100, sku: 'SKU001' },
            { name: 'Product 2', category: 'books', price: 20, sku: 'SKU002' },
            { name: 'Product 3', category: 'electronics', price: 200, sku: 'SKU003' }
        ]);

        console.log('\n1. 批量创建多个索引');
        const indexSpecs = [
            { key: { name: 1 }, name: 'name_idx' },
            { key: { category: 1, price: -1 }, name: 'category_price_idx' },
            { key: { sku: 1 }, unique: true, name: 'sku_unique' }
        ];

        const result = await products.createIndexes(indexSpecs);
        console.log(`✓ 批量创建成功: ${result.length} 个索引`);
        result.forEach(name => console.log(`  - ${name}`));

        console.log('\n2. 列出所有索引');
        const indexes = await products.listIndexes();
        console.log(`✓ 当前共有 ${indexes.length} 个索引`);

        console.log('\n✓ 示例 4 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 5: TTL 索引（自动过期）
 *
 * 演示如何创建 TTL 索引，自动删除过期文档
 */
async function example5_ttlIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 5: TTL 索引（自动过期）');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const sessions = collection('sessions');

    try {
        // 清理旧数据
        try { await sessions.drop(); } catch (err) { /* 忽略 */ }

        console.log('\n1. 创建 TTL 索引（1 小时后过期）');
        const result = await sessions.createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 3600, name: 'session_ttl' }
        );
        console.log('✓ TTL 索引创建成功:', result.name);

        console.log('\n2. 插入会话数据');
        await sessions.insertOne({
            sessionId: 'session_123',
            userId: 'user1',
            createdAt: new Date()
        });
        console.log('✓ 会话数据插入成功');

        console.log('\n3. 验证 TTL 索引');
        const indexes = await sessions.listIndexes();
        const ttlIndex = indexes.find(idx => idx.name === 'session_ttl');
        console.log('✓ TTL 索引配置:');
        console.log('  - 过期时间:', ttlIndex.expireAfterSeconds, '秒');
        console.log('  - 索引字段:', ttlIndex.key);

        console.log('\n📝 说明:');
        console.log('  MongoDB 会在后台自动删除过期文档');
        console.log('  后台任务每 60 秒运行一次');
        console.log('  文档可能在过期后最多延迟 60 秒才被删除');

        console.log('\n✓ 示例 5 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 6: 部分索引
 *
 * 演示如何创建部分索引，仅索引满足条件的文档
 */
async function example6_partialIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 6: 部分索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const users = collection('users_partial');

    try {
        // 清理旧数据
        try { await users.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await users.insertMany([
            { name: 'Alice', age: 25, status: 'active' },
            { name: 'Bob', age: 17, status: 'active' },
            { name: 'Charlie', age: 30, status: 'inactive' }
        ]);

        console.log('\n1. 创建部分索引（仅索引成年用户）');
        const result = await users.createIndex(
            { age: 1 },
            {
                partialFilterExpression: { age: { $gte: 18 } },
                name: 'age_adult_only'
            }
        );
        console.log('✓ 部分索引创建成功:', result.name);

        console.log('\n2. 验证索引配置');
        const indexes = await users.listIndexes();
        const partialIndex = indexes.find(idx => idx.name === 'age_adult_only');
        console.log('✓ 部分索引配置:');
        console.log('  - 索引字段:', partialIndex.key);
        console.log('  - 过滤条件:', JSON.stringify(partialIndex.partialFilterExpression));

        console.log('\n📝 说明:');
        console.log('  部分索引只索引 age >= 18 的文档');
        console.log('  节省存储空间，提高索引维护效率');
        console.log('  查询 age < 18 的文档不会使用此索引');

        console.log('\n✓ 示例 6 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 7: 稀疏索引
 *
 * 演示如何创建稀疏索引，仅索引包含字段的文档
 */
async function example7_sparseIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 7: 稀疏索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const users = collection('users_sparse');

    try {
        // 清理旧数据
        try { await users.drop(); } catch (err) { /* 忽略 */ }

        console.log('\n1. 创建稀疏索引');
        const result = await users.createIndex(
            { phone: 1 },
            { sparse: true, name: 'phone_sparse' }
        );
        console.log('✓ 稀疏索引创建成功:', result.name);

        console.log('\n2. 插入数据（部分包含 phone 字段）');
        await users.insertMany([
            { name: 'Alice', phone: '1234567890' },
            { name: 'Bob' },  // 没有 phone 字段
            { name: 'Charlie', phone: '0987654321' }
        ]);
        console.log('✓ 数据插入成功');

        console.log('\n📝 说明:');
        console.log('  稀疏索引仅索引包含 phone 字段的文档');
        console.log('  Bob 的记录不会被索引');
        console.log('  适用于可选字段的索引');

        console.log('\n✓ 示例 7 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 8: 删除索引
 *
 * 演示如何删除不需要的索引
 */
async function example8_dropIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 8: 删除索引');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const products = collection('products_drop');

    try {
        // 清理旧数据
        try { await products.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await products.insertOne({ name: 'Product 1', price: 100 });

        console.log('\n1. 创建多个索引');
        await products.createIndex({ name: 1 });
        await products.createIndex({ price: 1 });
        await products.createIndex({ name: 1, price: -1 });

        let indexes = await products.listIndexes();
        console.log(`✓ 当前有 ${indexes.length} 个索引`);

        console.log('\n2. 删除单个索引');
        await products.dropIndex('price_1');
        console.log('✓ 索引 "price_1" 已删除');

        indexes = await products.listIndexes();
        console.log(`✓ 剩余 ${indexes.length} 个索引`);

        console.log('\n3. 删除所有索引（_id 除外）');
        await products.dropIndexes();
        console.log('✓ 所有自定义索引已删除');

        indexes = await products.listIndexes();
        console.log(`✓ 仅剩 ${indexes.length} 个索引 (_id)`);

        console.log('\n✓ 示例 8 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 9: 索引管理最佳实践
 *
 * 演示一个完整的索引管理工作流
 */
async function example9_indexManagementWorkflow() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 9: 索引管理最佳实践');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const articles = collection('articles');

    try {
        // 清理旧数据
        try { await articles.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await articles.insertMany([
            { title: 'Article 1', author: 'Alice', tags: ['tech'], views: 100, publishedAt: new Date() },
            { title: 'Article 2', author: 'Bob', tags: ['tech', 'ai'], views: 200, publishedAt: new Date() },
            { title: 'Article 3', author: 'Alice', tags: ['science'], views: 150, publishedAt: new Date() }
        ]);

        console.log('\n步骤 1: 初始化索引');
        await articles.createIndexes([
            { key: { author: 1 }, name: 'author_idx' },
            { key: { publishedAt: -1 }, name: 'published_idx' },
            { key: { views: -1 }, name: 'views_idx' }
        ]);
        console.log('✓ 初始索引创建完成');

        console.log('\n步骤 2: 检查现有索引');
        let indexes = await articles.listIndexes();
        console.log('✓ 当前索引:');
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        console.log('\n步骤 3: 删除不需要的索引');
        console.log('  分析：views 索引使用率低，可以删除');
        await articles.dropIndex('views_idx');
        console.log('✓ 索引 "views_idx" 已删除');

        console.log('\n步骤 4: 添加新的复合索引');
        console.log('  分析：经常按作者和发布日期查询，添加复合索引');
        await articles.createIndex(
            { author: 1, publishedAt: -1 },
            { name: 'author_published_idx' }
        );
        console.log('✓ 复合索引创建完成');

        console.log('\n步骤 5: 最终索引状态');
        indexes = await articles.listIndexes();
        console.log('✓ 最终索引:');
        indexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        console.log('\n📝 索引管理最佳实践:');
        console.log('  1. 根据查询模式设计索引');
        console.log('  2. 定期检查索引使用情况');
        console.log('  3. 删除不使用的索引（减少存储和维护成本）');
        console.log('  4. 使用复合索引支持多字段查询');
        console.log('  5. 注意索引顺序（复合索引的字段顺序很重要）');

        console.log('\n✓ 示例 9 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 示例 10: 文本索引（全文搜索）
 *
 * 演示如何创建文本索引进行全文搜索
 */
async function example10_textIndex() {
    console.log('\n' + '='.repeat(70));
    console.log('示例 10: 文本索引（全文搜索）');
    console.log('='.repeat(70));

    const msq = new MonSQLize(config);
    const { collection } = await msq.connect();
    const articles = collection('articles_text');

    try {
        // 清理旧数据
        try { await articles.drop(); } catch (err) { /* 忽略 */ }

        // 插入测试数据
        await articles.insertMany([
            { title: 'MongoDB Indexing Guide', content: 'Learn how to create and manage indexes in MongoDB' },
            { title: 'JavaScript Tutorial', content: 'A comprehensive guide to JavaScript programming' },
            { title: 'Database Performance', content: 'Optimize your database queries with proper indexing' }
        ]);

        console.log('\n1. 创建文本索引');
        const result = await articles.createIndex(
            { title: 'text', content: 'text' },
            { name: 'text_search_idx' }
        );
        console.log('✓ 文本索引创建成功:', result.name);

        console.log('\n2. 验证文本索引');
        const indexes = await articles.listIndexes();
        const textIndex = indexes.find(idx => idx.name === 'text_search_idx');
        console.log('✓ 文本索引配置:');
        console.log('  - 索引字段:', textIndex.key);

        console.log('\n📝 说明:');
        console.log('  文本索引支持全文搜索');
        console.log('  可以搜索多个字段');
        console.log('  使用示例: db.articles.find({ $text: { $search: "mongodb indexing" } })');

        console.log('\n✓ 示例 10 完成');
    } finally {
        await msq.close();
    }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
    console.log('\n' + '█'.repeat(70));
    console.log('MongoDB 索引管理完整示例');
    console.log('█'.repeat(70));

    try {
        await example1_basicIndex();
        await example2_uniqueIndex();
        await example3_compoundIndex();
        await example4_createMultipleIndexes();
        await example5_ttlIndex();
        await example6_partialIndex();
        await example7_sparseIndex();
        await example8_dropIndex();
        await example9_indexManagementWorkflow();
        await example10_textIndex();

        console.log('\n' + '█'.repeat(70));
        console.log('✓ 所有示例运行完成！');
        console.log('█'.repeat(70));
        console.log('\n📚 更多信息:');
        console.log('  - API 文档: docs/index-management.md');
        console.log('  - 测试用例: test/unit/features/indexes.test.js');
        console.log('  - GitHub: https://github.com/your-repo/monSQLize');
        console.log('\n');
    } catch (error) {
        console.error('\n❌ 示例运行失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 运行所有示例
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    example1_basicIndex,
    example2_uniqueIndex,
    example3_compoundIndex,
    example4_createMultipleIndexes,
    example5_ttlIndex,
    example6_partialIndex,
    example7_sparseIndex,
    example8_dropIndex,
    example9_indexManagementWorkflow,
    example10_textIndex,
    runAllExamples
};

