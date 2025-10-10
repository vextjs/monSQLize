/**
 * distinct 方法示例
 * 演示字段去重查询的各种用法
 */

const MonSQLize = require('../lib/index');

async function main() {
    // 初始化 MonSQLize
    const db = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: {
            uri: process.env.MONGO_URI || 'mongodb://localhost:27017'
        },
        cache: { maxSize: 1000 },
        logger: console,
        maxTimeMS: 5000,
        slowQueryMs: 100
    });

    try {
        await db.connect();
        const collection = db.collection('users');

        console.log('\n=== distinct 方法示例 ===\n');

        // 示例 1：基础用法 - 获取所有不同的状态值
        console.log('1. 基础用法：获取所有不同的状态值');
        const statuses = await collection.distinct('status');
        console.log('所有状态:', statuses);
        console.log('状态数量:', statuses.length);

        // 示例 2：带查询条件 - 获取年龄大于 18 的用户的所有不同城市
        console.log('\n2. 带查询条件：年龄大于 18 的用户城市');
        const cities = await collection.distinct('city', {
            query: { age: { $gt: 18 } }
        });
        console.log('城市列表:', cities);

        // 示例 3：嵌套字段 - 获取所有不同的用户角色
        console.log('\n3. 嵌套字段：获取用户角色');
        const roles = await collection.distinct('profile.role', {
            query: { 'profile.active': true }
        });
        console.log('角色列表:', roles);

        // 示例 4：带缓存 - 缓存 60 秒
        console.log('\n4. 带缓存：缓存 60 秒');
        const t1 = Date.now();
        const tags1 = await collection.distinct('tags', {
            query: { published: true },
            cache: 60000
        });
        console.log('首次查询耗时:', Date.now() - t1, 'ms');
        console.log('标签数量:', tags1.length);

        // 再次查询，应该命中缓存
        const t2 = Date.now();
        const tags2 = await collection.distinct('tags', {
            query: { published: true },
            cache: 60000
        });
        console.log('缓存查询耗时:', Date.now() - t2, 'ms');
        console.log('结果一致:', JSON.stringify(tags1) === JSON.stringify(tags2));

        // 示例 5：带 meta 信息 - 查看查询耗时
        console.log('\n5. 带 meta 信息：查看查询详情');
        const result = await collection.distinct('department', {
            query: { active: true },
            cache: 30000,
            maxTimeMS: 3000,
            meta: true
        });
        console.log('部门列表:', result.data);
        console.log('查询元信息:');
        console.log('  - 操作:', result.meta.op);
        console.log('  - 耗时:', result.meta.durationMs, 'ms');
        console.log('  - 命名空间:', result.meta.ns);
        console.log('  - 是否命中缓存:', result.meta.fromCache || false);

        // 示例 6：带 hint 索引提示
        console.log('\n6. 带索引提示（hint）');
        const countries = await collection.distinct('country', {
            query: { status: 'active' },
            hint: { status: 1, country: 1 }
        });
        console.log('国家列表:', countries);

        // 示例 7：带 collation 排序规则（大小写不敏感）
        console.log('\n7. 带排序规则（collation）');
        const names = await collection.distinct('name', {
            query: {},
            collation: { locale: 'en', strength: 2 } // 大小写不敏感
        });
        console.log('名字列表:', names);

        // 示例 8：数组字段去重
        console.log('\n8. 数组字段去重');
        const allTags = await collection.distinct('tags', {
            query: {}
        });
        console.log('所有标签（数组展开后）:', allTags);

        // 示例 9：缓存失效
        console.log('\n9. 缓存失效演示');

        // 先查询并缓存
        await collection.distinct('status', { cache: 60000 });
        console.log('已缓存 status 查询');

        // 失效特定操作的缓存
        const deleted = await collection.invalidate('distinct');
        console.log('失效 distinct 缓存，删除键数:', deleted);

        // 再次查询，不会命中缓存
        const { meta } = await collection.distinct('status', {
            cache: 60000,
            meta: true
        });
        console.log('缓存已失效，fromCache:', meta.fromCache || false);

        // 示例 10：慢查询日志监听
        console.log('\n10. 慢查询事件监听');

        // 注册慢查询监听器
        db.on('slow-query', (meta) => {
            console.log('🐌 检测到慢查询:', {
                op: meta.op,
                durationMs: meta.durationMs,
                collection: meta.ns.coll
            });
        });

        // 执行一个可能较慢的查询（设置较低的慢查询阈值）
        await collection.distinct('email', {
            query: { age: { $gte: 18, $lte: 65 } },
            maxTimeMS: 5000
        });

        // 示例 11：综合示例 - 统计分析
        console.log('\n11. 综合示例：用户统计分析');

        const [
            uniqueStatuses,
            uniqueCities,
            uniqueRoles,
            uniqueDepartments
        ] = await Promise.all([
            collection.distinct('status'),
            collection.distinct('city', { query: { country: 'China' } }),
            collection.distinct('role'),
            collection.distinct('department', { query: { active: true } })
        ]);

        console.log('统计摘要:');
        console.log('  - 状态类型数:', uniqueStatuses.length);
        console.log('  - 中国城市数:', uniqueCities.length);
        console.log('  - 角色类型数:', uniqueRoles.length);
        console.log('  - 活跃部门数:', uniqueDepartments.length);

        console.log('\n=== 演示完成 ===\n');

    } catch (error) {
        console.error('错误:', error.message);
        console.error('堆栈:', error.stack);
    } finally {
        await db.close();
        console.log('数据库连接已关闭');
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };

