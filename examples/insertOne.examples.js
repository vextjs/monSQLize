/**
 * insertOne 方法使用示例
 * 
 * 功能：插入单个文档到 MongoDB 集合
 * 特性：
 * - 自动缓存失效
 * - 慢查询日志
 * - 重复键检测
 * - 支持 writeConcern, comment, bypassDocumentValidation
 */

const MonSQLize = require('../lib');

async function main() {
    // 创建 MonSQLize 实例
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'insertone_examples',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
        }
    });

    try {
        // 连接数据库
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // ============================================================
        // 示例 1: 基础插入
        // ============================================================
        console.log('【示例 1】基础插入');
        const result1 = await collection('users').insertOne({
            name: 'Alice',
            email: 'alice@example.com',
            age: 25,
            createdAt: new Date()
        });
        console.log('插入结果:', result1);
        console.log('- acknowledged:', result1.acknowledged);
        console.log('- insertedId:', result1.insertedId);
        console.log();

        // ============================================================
        // 示例 2: 使用 comment 参数（用于生产环境日志追踪）
        // ============================================================
        console.log('【示例 2】使用 comment 参数');
        const result2 = await collection('users').insertOne(
            {
                name: 'Bob',
                email: 'bob@example.com',
                age: 30
            },
            {
                comment: 'user-registration:v1:session-abc123'
            }
        );
        console.log('插入结果:', result2);
        console.log('提示: MongoDB 日志中可通过 comment 追踪此操作');
        console.log();

        // ============================================================
        // 示例 3: 使用 writeConcern（确保写入持久化）
        // ============================================================
        console.log('【示例 3】使用 writeConcern');
        const result3 = await collection('users').insertOne(
            {
                name: 'Charlie',
                email: 'charlie@example.com',
                age: 35,
                vip: true
            },
            {
                writeConcern: { w: 'majority', wtimeout: 5000 }
            }
        );
        console.log('插入结果:', result3);
        console.log('提示: w="majority" 确保写入复制到多数副本节点');
        console.log();

        // ============================================================
        // 示例 4: 插入包含嵌套对象的文档
        // ============================================================
        console.log('【示例 4】插入复杂文档');
        const result4 = await collection('users').insertOne({
            name: 'David',
            email: 'david@example.com',
            profile: {
                bio: 'Software Engineer',
                skills: ['JavaScript', 'Node.js', 'MongoDB'],
                location: {
                    city: 'San Francisco',
                    country: 'USA'
                }
            },
            metadata: {
                source: 'web',
                referrer: 'google'
            }
        });
        console.log('插入结果:', result4);
        console.log();

        // ============================================================
        // 示例 5: 插入包含数组的文档
        // ============================================================
        console.log('【示例 5】插入包含数组的文档');
        const result5 = await collection('posts').insertOne({
            title: 'MongoDB Best Practices',
            content: 'Learn how to use MongoDB effectively...',
            tags: ['mongodb', 'database', 'nosql'],
            comments: [
                { author: 'Alice', text: 'Great article!' },
                { author: 'Bob', text: 'Very helpful!' }
            ],
            publishedAt: new Date()
        });
        console.log('插入结果:', result5);
        console.log();

        // ============================================================
        // 示例 6: 重复键错误处理
        // ============================================================
        console.log('【示例 6】重复键错误处理');

        // 先插入一个文档
        await collection('users').insertOne({
            _id: 'fixed-id-123',
            name: 'First User',
            email: 'first@example.com'
        });
        console.log('✅ 首次插入成功');

        try {
            // 尝试插入相同的 _id
            await collection('users').insertOne({
                _id: 'fixed-id-123',
                name: 'Second User',
                email: 'second@example.com'
            });
        } catch (error) {
            console.log('❌ 捕获到重复键错误:');
            console.log('- code:', error.code); // DUPLICATE_KEY
            console.log('- message:', error.message);
            console.log('提示: monSQLize 自动将 MongoDB E11000 错误转换为标准错误码');
        }
        console.log();
        console.log();

        // ============================================================
        // 示例 7: 自动缓存失效
        // ============================================================
        console.log('【示例 7】自动缓存失效验证');

        // 先查询一次（建立缓存）
        const cached1 = await collection('users').find({ query: {} });
        console.log('首次查询结果数量:', cached1.length);

        // 插入新文档
        await collection('users').insertOne({
            name: 'Eve',
            email: 'eve@example.com'
        });
        console.log('✅ 插入新文档');

        // 再次查询（缓存已自动失效）
        const cached2 = await collection('users').find({ query: {} });
        console.log('再次查询结果数量:', cached2.length);
        console.log('提示: 插入操作自动失效了该集合的所有查询缓存');
        console.log();

        // ============================================================
        // 示例 8: 插入包含 Date 对象的文档
        // ============================================================
        console.log('【示例 8】插入包含 Date 对象');
        const result8 = await collection('events').insertOne({
            type: 'user-login',
            userId: result1.insertedId,
            timestamp: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天后过期
        });
        console.log('插入结果:', result8);
        console.log('提示: Date 对象会被正确序列化为 MongoDB ISODate');
        console.log();

        // ============================================================
        // 总结
        // ============================================================
        console.log('✅ 所有示例执行完成！');
        console.log('\n📝 关键特性：');
        console.log('1. 自动缓存失效 - 插入成功后自动清除该集合的查询缓存');
        console.log('2. 慢查询日志 - 插入耗时超过阈值时自动记录');
        console.log('3. 错误处理 - 自动检测重复键并转换为标准错误码');
        console.log('4. 灵活参数 - 支持 comment, writeConcern, bypassDocumentValidation');

    } catch (error) {
        console.error('❌ 错误:', error.message);
        throw error;
    } finally {
        // 关闭连接
        await msq.close();
        console.log('\n✅ 数据库连接已关闭');
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;
