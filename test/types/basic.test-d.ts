/**
 * TypeScript 类型定义测试
 * 用于验证类型定义的完整性和正确性
 */

import MonSQLize from 'monsqlize';

// 定义测试用的接口
interface User {
    _id: string;
    name: string;
    age: number;
    email: string;
}

interface Product {
    _id: string;
    name: string;
    price: number;
    category: string;
}

// 测试: 基础实例化
const db = new MonSQLize({
    type: 'mongodb',
    config: 'mongodb://localhost:27017',
    databaseName: 'test',
    maxTimeMS: 5000,
    findLimit: 100
});

// 测试: 类型检查通过
(async () => {
    const { collection } = await db.connect();

    // ============================================================================
    // 测试 1: 泛型支持 - collection<T>
    // ============================================================================
    const users = collection<User>('users');
    const products = collection<Product>('products');

    // ============================================================================
    // 测试 2: findOne 类型推断
    // ============================================================================
    const user = await users.findOne({ name: 'Alice' });
    if (user) {
        // user 应该被推断为 User | null
        const name: string = user.name;  // ✅ 应该有智能提示
        const age: number = user.age;
        console.log(name, age);
    }

    // ============================================================================
    // 测试 3: find 类型推断
    // ============================================================================
    const allUsers = await users.find({});
    // allUsers 应该被推断为 User[]
    const firstUser: User = allUsers[0];
    console.log(firstUser.email);

    // ============================================================================
    // 测试 4: insertOne 简化调用
    // ============================================================================
    const insertResult = await users.insertOne({
        _id: '123',
        name: 'Bob',
        age: 30,
        email: 'bob@example.com'
    });
    console.log(insertResult.insertedId);

    // ============================================================================
    // 测试 5: insertMany 简化调用
    // ============================================================================
    const insertManyResult = await products.insertMany([
        { _id: 'p1', name: 'Phone', price: 999, category: 'Electronics' },
        { _id: 'p2', name: 'Book', price: 29, category: 'Books' }
    ]);
    console.log(insertManyResult.insertedCount);

    // ============================================================================
    // 测试 6: findPage 泛型支持
    // ============================================================================
    const page = await users.findPage({
        pipeline: [{ $match: { age: { $gte: 18 } } }],
        sort: { name: 1 },
        limit: 10,
        totals: { mode: 'sync' }
    });
    const pageUsers: User[] = page.items;  // ✅ 使用 items 而不是 data
    console.log(pageUsers.length, page.totals?.totalPages);

    // ============================================================================
    // 测试 7: aggregate 泛型支持
    // ============================================================================
    interface AggResult {
        _id: string;
        total: number;
    }
    const aggResults = await users.aggregate<AggResult>([
        { $group: { _id: '$name', total: { $sum: 1 } } }
    ]);
    const firstAgg: AggResult = aggResults[0];
    console.log(firstAgg.total);

    // ============================================================================
    // 测试 8: 事务支持
    // ============================================================================
    await db.withTransaction(async (tx) => {
        await users.insertOne(
            { _id: '456', name: 'Charlie', age: 25, email: 'charlie@example.com' },
            { session: tx.session }
        );

        await products.insertOne(
            { _id: 'p3', name: 'Laptop', price: 1500, category: 'Electronics' },
            { session: tx.session }
        );
    });

    // ============================================================================
    // 测试 9: 静态方法
    // ============================================================================
    const Redis = require('ioredis');
    const redis = new Redis();
    const redisCache = MonSQLize.createRedisCacheAdapter(redis);
    await redisCache.set('key', 'value');
    const value = await redisCache.get('key');
    console.log(value);

    // ============================================================================
    // 测试 10: 工具方法
    // ============================================================================
    const cache = db.getCache();
    await cache.set('test', { data: 'value' });

    const defaults = db.getDefaults();
    console.log(defaults.maxTimeMS);

    await db.close();
})();

