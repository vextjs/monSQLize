/**
 * 测试脚本：验证 monSQLize 的查询缓存自动失效功能
 * 
 * 运行方式：
 * ```bash
 * # 方式 1：使用 MongoDB Memory Server（需要网络连接）
 * node test-cache-invalidation.js
 * 
 * # 方式 2：使用本地 MongoDB 实例
 * MONGODB_URI="mongodb://localhost:27017" node test-cache-invalidation.js
 * 
 * # 方式 3：使用远程 MongoDB 实例
 * MONGODB_URI="mongodb://username:password@host:port" node test-cache-invalidation.js
 * ```
 * 
 * 测试内容：
 * 1. TTL 自动过期测试 - 验证缓存在 TTL 到期后会自动失效
 * 2. insertOne 自动失效测试 - 验证插入操作会自动失效相关缓存
 * 3. updateOne 自动失效测试 - 验证更新操作会自动失效相关缓存
 * 4. deleteOne 自动失效测试 - 验证删除操作会自动失效相关缓存
 * 
 * 预期输出：
 * ```
 * 🚀 开始测试缓存自动失效功能
 * 
 * === 测试 1: TTL 自动过期 ===
 * 第一次查询: 2 条记录 (缓存 MISS)
 * 第二次查询: 2 条记录 (缓存 HIT)
 * 等待 2.5 秒...
 * 第三次查询: 2 条记录 (缓存 MISS - TTL 过期)
 * ✓ TTL 自动过期测试通过
 * 
 * === 测试 2: insertOne 自动失效 ===
 * 查询前: 2 条记录 (缓存)
 * 插入新记录: Charlie
 * 查询后: 3 条记录 (缓存已自动失效)
 * ✓ insertOne 自动失效测试通过
 * 
 * === 测试 3: updateOne 自动失效 ===
 * 更新前: Alice 的 age = 25
 * 更新 Alice 的 age 为 26
 * 更新后: Alice 的 age = 26 (缓存已自动失效)
 * ✓ updateOne 自动失效测试通过
 * 
 * === 测试 4: deleteOne 自动失效 ===
 * 删除前: 3 条记录
 * 删除 Charlie
 * 删除后: 2 条记录 (缓存已自动失效)
 * ✓ deleteOne 自动失效测试通过
 * 
 * ✅ 所有测试通过！
 * ```
 */

const MonSQLize = require('./lib/index');

/**
 * 等待指定的时间（毫秒）
 * @param {number} ms - 等待的毫秒数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取缓存统计信息并判断是否来自缓存
 * @param {Object} prevStats - 之前的缓存统计信息
 * @param {Object} currentStats - 当前的缓存统计信息
 * @returns {string} 返回 'MISS' 或 'HIT'
 */
function getCacheStatus(prevStats, currentStats) {
    if (currentStats.hits > prevStats.hits) {
        return 'HIT';
    } else if (currentStats.misses > prevStats.misses) {
        return 'MISS';
    }
    return 'UNKNOWN';
}

async function testCacheInvalidation() {
    console.log('🚀 开始测试缓存自动失效功能\n');

    // 配置：优先使用环境变量 MONGODB_URI，否则使用内存数据库
    const mongoConfig = process.env.MONGODB_URI 
        ? { uri: process.env.MONGODB_URI }
        : { useMemoryServer: true };

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_cache',
        config: mongoConfig,
        cache: {
            maxSize: 1000,
            enableStats: true
        }
    });

    try {
        await msq.connect();
        const collection = msq.collection('test_users');

        // 清理数据
        await collection.deleteMany({});

        // 插入初始数据
        await collection.insertOne({ name: 'Alice', age: 25 });
        await collection.insertOne({ name: 'Bob', age: 30 });

        // =====================================================
        // 测试 1: TTL 自动过期
        // =====================================================
        console.log('=== 测试 1: TTL 自动过期 ===');
        
        // 清空缓存以确保干净的起点
        await msq.getCache().clear();
        
        // 第一次查询（缓存 MISS，TTL = 2 秒）
        let stats = msq.getCache().stats;
        let prevHits = stats.hits;
        let prevMisses = stats.misses;
        
        const result1 = await collection.find({}, { cache: 2000 });
        stats = msq.getCache().stats;
        const status1 = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        console.log(`第一次查询: ${result1.length} 条记录 (缓存 ${status1})`);
        
        // 第二次查询（立即查询，缓存 HIT）
        prevHits = stats.hits;
        prevMisses = stats.misses;
        
        const result2 = await collection.find({}, { cache: 2000 });
        stats = msq.getCache().stats;
        const status2 = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        console.log(`第二次查询: ${result2.length} 条记录 (缓存 ${status2})`);
        
        // 等待 2.5 秒让 TTL 过期
        console.log('等待 2.5 秒...');
        await sleep(2500);
        
        // 第三次查询（TTL 过期，缓存 MISS）
        prevHits = stats.hits;
        prevMisses = stats.misses;
        
        const result3 = await collection.find({}, { cache: 2000 });
        stats = msq.getCache().stats;
        const status3 = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        console.log(`第三次查询: ${result3.length} 条记录 (缓存 ${status3} - TTL 过期)`);
        
        if (status1 === 'MISS' && status2 === 'HIT' && status3 === 'MISS') {
            console.log('✓ TTL 自动过期测试通过\n');
        } else {
            throw new Error(`TTL 测试失败: 期望 MISS->HIT->MISS, 实际 ${status1}->${status2}->${status3}`);
        }

        // =====================================================
        // 测试 2: insertOne 自动失效
        // =====================================================
        console.log('=== 测试 2: insertOne 自动失效 ===');
        
        // 清空缓存
        await msq.getCache().clear();
        
        // 查询并缓存数据
        const beforeInsert = await collection.find({}, { cache: 60000 });
        console.log(`查询前: ${beforeInsert.length} 条记录 (缓存)`);
        
        // 确认数据已被缓存
        prevHits = msq.getCache().stats.hits;
        prevMisses = msq.getCache().stats.misses;
        const cachedBeforeInsert = await collection.find({}, { cache: 60000 });
        stats = msq.getCache().stats;
        const cacheStatus = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        
        if (cacheStatus !== 'HIT') {
            throw new Error('数据未被成功缓存');
        }
        
        // 执行 insertOne 操作
        console.log('插入新记录: Charlie');
        await collection.insertOne({ name: 'Charlie', age: 35 });
        
        // 查询后（缓存应该已失效）
        prevHits = stats.hits;
        prevMisses = stats.misses;
        
        const afterInsert = await collection.find({}, { cache: 60000 });
        stats = msq.getCache().stats;
        const afterInsertStatus = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        console.log(`查询后: ${afterInsert.length} 条记录 (缓存已自动失效)`);
        
        if (afterInsert.length === 3 && afterInsertStatus === 'MISS') {
            console.log('✓ insertOne 自动失效测试通过\n');
        } else {
            throw new Error(`insertOne 测试失败: 记录数=${afterInsert.length}, 缓存状态=${afterInsertStatus}`);
        }

        // =====================================================
        // 测试 3: updateOne 自动失效
        // =====================================================
        console.log('=== 测试 3: updateOne 自动失效 ===');
        
        // 清空缓存
        await msq.getCache().clear();
        
        // 查询 Alice 的数据
        const aliceBefore = await collection.findOne({ name: 'Alice' }, { cache: 60000 });
        console.log(`更新前: Alice 的 age = ${aliceBefore.age}`);
        
        // 确认数据已被缓存
        prevHits = msq.getCache().stats.hits;
        prevMisses = msq.getCache().stats.misses;
        await collection.findOne({ name: 'Alice' }, { cache: 60000 });
        stats = msq.getCache().stats;
        const cacheStatusUpdate = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        
        if (cacheStatusUpdate !== 'HIT') {
            throw new Error('数据未被成功缓存');
        }
        
        // 更新 Alice 的 age
        console.log('更新 Alice 的 age 为 26');
        await collection.updateOne({ name: 'Alice' }, { $set: { age: 26 } });
        
        // 查询更新后的数据（缓存应该已失效）
        prevHits = stats.hits;
        prevMisses = stats.misses;
        
        const aliceAfter = await collection.findOne({ name: 'Alice' }, { cache: 60000 });
        stats = msq.getCache().stats;
        const afterUpdateStatus = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        console.log(`更新后: Alice 的 age = ${aliceAfter.age} (缓存已自动失效)`);
        
        if (aliceAfter.age === 26 && afterUpdateStatus === 'MISS') {
            console.log('✓ updateOne 自动失效测试通过\n');
        } else {
            throw new Error(`updateOne 测试失败: age=${aliceAfter.age}, 缓存状态=${afterUpdateStatus}`);
        }

        // =====================================================
        // 测试 4: deleteOne 自动失效
        // =====================================================
        console.log('=== 测试 4: deleteOne 自动失效 ===');
        
        // 清空缓存
        await msq.getCache().clear();
        
        // 查询所有数据
        const beforeDelete = await collection.find({}, { cache: 60000 });
        console.log(`删除前: ${beforeDelete.length} 条记录`);
        
        // 确认数据已被缓存
        prevHits = msq.getCache().stats.hits;
        prevMisses = msq.getCache().stats.misses;
        await collection.find({}, { cache: 60000 });
        stats = msq.getCache().stats;
        const cacheStatusDelete = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        
        if (cacheStatusDelete !== 'HIT') {
            throw new Error('数据未被成功缓存');
        }
        
        // 删除 Charlie
        console.log('删除 Charlie');
        await collection.deleteOne({ name: 'Charlie' });
        
        // 查询删除后的数据（缓存应该已失效）
        prevHits = stats.hits;
        prevMisses = stats.misses;
        
        const afterDelete = await collection.find({}, { cache: 60000 });
        stats = msq.getCache().stats;
        const afterDeleteStatus = getCacheStatus({ hits: prevHits, misses: prevMisses }, stats);
        console.log(`删除后: ${afterDelete.length} 条记录 (缓存已自动失效)`);
        
        if (afterDelete.length === 2 && afterDeleteStatus === 'MISS') {
            console.log('✓ deleteOne 自动失效测试通过\n');
        } else {
            throw new Error(`deleteOne 测试失败: 记录数=${afterDelete.length}, 缓存状态=${afterDeleteStatus}`);
        }

        console.log('✅ 所有测试通过！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    } finally {
        await msq.close();
    }
}

testCacheInvalidation();
